/**
 * Cron Service - Scheduled task management
 *
 * Based on nanobot architecture:
 * - https://github.com/nanobot-xyz/nanobot
 */

import { randomUUID } from 'crypto';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import {
  CronJob,
  CronSchedule,
  CronStore,
  CronJobCallback,
} from './types';

// ============================================================================
// Utilities
// ============================================================================

function nowMs(): number {
  return Date.now();
}

/**
 * Compute next run time in ms
 * For "at" and "every", we compute directly
 * For "cron", we need a cron library - simplified implementation for now
 */
function computeNextRun(schedule: CronSchedule, nowMs: number): number | null {
  if (schedule.kind === 'at') {
    return schedule.at_ms && schedule.at_ms > nowMs ? schedule.at_ms : null;
  }

  if (schedule.kind === 'every') {
    if (!schedule.every_ms || schedule.every_ms <= 0) {
      return null;
    }
    return nowMs + schedule.every_ms;
  }

  if (schedule.kind === 'cron' && schedule.expr) {
    return computeCronNextRun(schedule.expr, nowMs, schedule.tz);
  }

  return null;
}

/**
 * Simplified cron expression parser
 * Supports basic expressions: "min hour day month dow"
 * For full support, consider using a library like 'cron' or 'node-cron'
 */
function computeCronNextRun(expr: string, nowMs: number, _tz?: string): number | null {
  try {
    // Parse cron expression: "min hour day month dow"
    const parts = expr.trim().split(/\s+/);
    if (parts.length < 5) {
      return null;
    }

    const [minStr, hourStr, dayStr, monthStr, dowStr] = parts;
    const now = new Date(nowMs);

    // Parse components
    const minute = parseCronComponent(minStr, 0, 59);
    const hour = parseCronComponent(hourStr, 0, 23);
    const day = parseCronComponent(dayStr, 1, 31);
    const month = parseCronComponent(monthStr, 1, 12);
    const dow = parseCronComponent(dowStr, 0, 6);

    // Find next matching time
    const nextDate = new Date(now);
    nextDate.setSeconds(0, 0);
    nextDate.setMinutes(nextDate.getMinutes() + 1);

    // Try up to 4 years ahead
    for (let i = 0; i < 1461; i++) {
      if (
        matchesCronComponent(nextDate.getMinutes(), minute) &&
        matchesCronComponent(nextDate.getHours(), hour) &&
        matchesCronComponent(nextDate.getDate(), day) &&
        matchesCronComponent(nextDate.getMonth() + 1, month) &&
        matchesCronComponent(nextDate.getDay(), dow)
      ) {
        return nextDate.getTime();
      }
      nextDate.setMinutes(nextDate.getMinutes() + 1);
    }

    return null;
  } catch {
    return null;
  }
}

function parseCronComponent(pattern: string, min: number, max: number): Set<number> | null {
  const values = new Set<number>();

  if (pattern === '*') {
    for (let i = min; i <= max; i++) {
      values.add(i);
    }
    return values;
  }

  // Handle ranges: "1-5"
  if (pattern.includes('-')) {
    const [start, end] = pattern.split('-').map(Number);
    if (!isNaN(start) && !isNaN(end)) {
      for (let i = Math.max(min, start); i <= Math.min(max, end); i++) {
        values.add(i);
      }
      return values;
    }
  }

  // Handle lists: "1,2,3"
  if (pattern.includes(',')) {
    for (const part of pattern.split(',')) {
      const val = parseInt(part, 10);
      if (!isNaN(val) && val >= min && val <= max) {
        values.add(val);
      }
    }
    return values.size > 0 ? values : null;
  }

  // Single value
  const val = parseInt(pattern, 10);
  if (!isNaN(val) && val >= min && val <= max) {
    values.add(val);
    return values;
  }

  return null;
}

function matchesCronComponent(value: number, allowed: Set<number> | null): boolean {
  return allowed ? allowed.has(value) : false;
}

// ============================================================================
// CronService
// ============================================================================

export class CronService {
  private storePath: string;
  private onJob: CronJobCallback | null;
  private store: CronStore | null = null;
  private timerHandle: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    userDataPath: string,
    onJob: CronJobCallback | null = null
  ) {
    this.storePath = join(userDataPath, 'scheduler', 'jobs.json');
    this.onJob = onJob;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async loadStore(): Promise<CronStore> {
    if (this.store) {
      return this.store;
    }

    try {
      const data = await readFile(this.storePath, 'utf-8');
      const parsed = JSON.parse(data);

      const jobs: CronJob[] = [];
      for (const j of parsed.jobs || []) {
        jobs.push({
          id: j.id,
          name: j.name,
          enabled: j.enabled ?? true,
          schedule: j.schedule,
          payload: j.payload,
          state: j.state || {},
          created_at_ms: j.created_at_ms || 0,
          updated_at_ms: j.updated_at_ms || 0,
          delete_after_run: j.delete_after_run || false,
        });
      }

      this.store = {
        version: parsed.version || 1,
        jobs,
      };
    } catch {
      // File doesn't exist or is invalid
      this.store = { version: 1, jobs: [] };
    }

    return this.store;
  }

  private async saveStore(): Promise<void> {
    if (!this.store) {
      return;
    }

    const dir = join(this.storePath, '..');
    await mkdir(dir, { recursive: true });

    const data = JSON.stringify(this.store, null, 2);
    await writeFile(this.storePath, data, 'utf-8');
  }

  private recomputeNextRuns(): void {
    if (!this.store) {
      return;
    }

    const now = nowMs();
    for (const job of this.store.jobs) {
      if (job.enabled) {
        job.state.next_run_at_ms = computeNextRun(job.schedule, now);
      }
    }
  }

  private getNextWakeMs(): number | null {
    if (!this.store) {
      return null;
    }

    const times = this.store.jobs
      .filter(j => j.enabled && j.state.next_run_at_ms)
      .map(j => j.state.next_run_at_ms!);

    return times.length > 0 ? Math.min(...times) : null;
  }

  private armTimer(): void {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }

    const nextWake = this.getNextWakeMs();
    if (!nextWake || !this.running) {
      return;
    }

    const delayMs = Math.max(0, nextWake - nowMs());

    this.timerHandle = setTimeout(() => {
      if (this.running) {
        this.onTimer().catch(console.error);
      }
    }, delayMs);
  }

  private async onTimer(): Promise<void> {
    if (!this.store) {
      return;
    }

    const now = nowMs();
    const dueJobs = this.store.jobs.filter(
      j => j.enabled && j.state.next_run_at_ms && now >= j.state.next_run_at_ms
    );

    for (const job of dueJobs) {
      await this.executeJob(job);
    }

    await this.saveStore();
    this.armTimer();
  }

  private async executeJob(job: CronJob): Promise<void> {
    const startMs = nowMs();
    console.log(`[CronService] Executing job '${job.name}' (${job.id})`);

    try {
      if (this.onJob) {
        await this.onJob(job);
      }

      job.state.last_status = 'ok';
      job.state.last_error = null;
      console.log(`[CronService] Job '${job.name}' completed`);
    } catch (error: any) {
      job.state.last_status = 'error';
      job.state.last_error = String(error);
      console.error(`[CronService] Job '${job.name}' failed:`, error);
    }

    job.state.last_run_at_ms = startMs;
    job.updated_at_ms = nowMs();

    // Handle one-shot jobs
    if (job.schedule.kind === 'at') {
      if (job.delete_after_run) {
        this.store!.jobs = this.store!.jobs.filter(j => j.id !== job.id);
      } else {
        job.enabled = false;
        job.state.next_run_at_ms = null;
      }
    } else {
      // Compute next run
      job.state.next_run_at_ms = computeNextRun(job.schedule, nowMs());
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Start the cron service
   */
  async start(): Promise<void> {
    this.running = true;
    await this.loadStore();
    this.recomputeNextRuns();
    await this.saveStore();
    this.armTimer();
    console.log(`[CronService] Started with ${this.store?.jobs.length || 0} jobs`);
  }

  /**
   * Stop the cron service
   */
  stop(): void {
    this.running = false;
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  /**
   * List all jobs
   */
  async listJobs(includeDisabled = false): Promise<CronJob[]> {
    const store = await this.loadStore();
    const jobs = includeDisabled
      ? store.jobs
      : store.jobs.filter(j => j.enabled);

    return jobs.sort((a, b) => {
      const aTime = a.state.next_run_at_ms ?? Infinity;
      const bTime = b.state.next_run_at_ms ?? Infinity;
      return aTime - bTime;
    });
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<CronJob | null> {
    const store = await this.loadStore();
    return store.jobs.find(j => j.id === jobId) || null;
  }

  /**
   * Add a new job
   */
  async addJob(
    name: string,
    schedule: CronSchedule,
    message: string,
    options: {
      tools?: string[];
      delete_after_run?: boolean;
    } = {}
  ): Promise<CronJob> {
    const store = await this.loadStore();
    const now = nowMs();

    const job: CronJob = {
      id: randomUUID().slice(0, 8),
      name,
      enabled: true,
      schedule,
      payload: {
        kind: 'message',
        message,
        tools: options.tools,
      },
      state: {
        next_run_at_ms: computeNextRun(schedule, now),
      },
      created_at_ms: now,
      updated_at_ms: now,
      delete_after_run: options.delete_after_run || false,
    };

    store.jobs.push(job);
    await this.saveStore();
    this.armTimer();

    console.log(`[CronService] Added job '${name}' (${job.id})`);
    return job;
  }

  /**
   * Remove a job by ID
   */
  async removeJob(jobId: string): Promise<boolean> {
    const store = await this.loadStore();
    const before = store.jobs.length;
    store.jobs = store.jobs.filter(j => j.id !== jobId);
    const removed = store.jobs.length < before;

    if (removed) {
      await this.saveStore();
      this.armTimer();
      console.log(`[CronService] Removed job ${jobId}`);
    }

    return removed;
  }

  /**
   * Enable or disable a job
   */
  async enableJob(jobId: string, enabled = true): Promise<CronJob | null> {
    const store = await this.loadStore();
    const job = store.jobs.find(j => j.id === jobId);

    if (job) {
      job.enabled = enabled;
      job.updated_at_ms = nowMs();

      if (enabled) {
        job.state.next_run_at_ms = computeNextRun(job.schedule, nowMs());
      } else {
        job.state.next_run_at_ms = null;
      }

      await this.saveStore();
      this.armTimer();
      return job;
    }

    return null;
  }

  /**
   * Manually run a job
   */
  async runJob(jobId: string, force = false): Promise<boolean> {
    const store = await this.loadStore();
    const job = store.jobs.find(j => j.id === jobId);

    if (job) {
      if (!force && !job.enabled) {
        return false;
      }
      await this.executeJob(job);
      await this.saveStore();
      this.armTimer();
      return true;
    }

    return false;
  }

  /**
   * Get service status
   */
  async status(): Promise<{
    enabled: boolean;
    jobs: number;
    next_wake_at_ms: number | null;
  }> {
    const store = await this.loadStore();
    return {
      enabled: this.running,
      jobs: store.jobs.length,
      next_wake_at_ms: this.getNextWakeMs(),
    };
  }

  /**
   * Clear all jobs
   */
  async clearAll(): Promise<boolean> {
    const store = await this.loadStore();
    store.jobs = [];
    await this.saveStore();
    this.armTimer();
    return true;
  }
}

// ============================================================================
// Singleton
// ============================================================================

let cronServiceInstance: CronService | null = null;

export function getCronService(): CronService {
  if (!cronServiceInstance) {
    const userDataPath = app.getPath('userData');
    cronServiceInstance = new CronService(userDataPath);
  }
  return cronServiceInstance;
}

export function setCronService(service: CronService): void {
  cronServiceInstance = service;
}

export function resetCronService(): void {
  if (cronServiceInstance) {
    cronServiceInstance.stop();
    cronServiceInstance = null;
  }
}
