/**
 * Heartbeat Service - Periodic agent wake-up to check for tasks
 *
 * Based on nanobot architecture:
 * - https://github.com/nanobot-xyz/nanobot
 *
 * The agent reads HEARTBEAT.md from the workspace and executes any
 * tasks listed there. If nothing needs attention, it replies HEARTBEAT_OK.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import {
  HeartbeatConfig,
  HeartbeatCallback,
  HeartbeatTask,
  DEFAULT_HEARTBEAT_INTERVAL_S,
  HEARTBEAT_OK_TOKEN,
  HEARTBEAT_PROMPT,
} from './types';

// ============================================================================
// Utilities
// ============================================================================

/**
 * Check if HEARTBEAT.md has no actionable content
 */
function isHeartbeatEmpty(content: string | null): boolean {
  if (!content) {
    return true;
  }

  // Lines to skip: empty, headers, HTML comments, empty checkboxes
  const skipPatterns = new Set(['- [ ]', '* [ ]', '- [x]', '* [x]', '<!--', '-->']);

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || skipPatterns.has(trimmed.split(' ')[0])) {
      continue;
    }
    return false; // Found actionable content
  }

  return true;
}

/**
 * Parse HEARTBEAT.md content to extract tasks
 */
function parseHeartbeatTasks(content: string): HeartbeatTask[] {
  const tasks: HeartbeatTask[] = [];
  const lines = content.split('\n');

  let currentTask: HeartbeatTask | null = null;
  let inActiveSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Detect sections
    if (trimmed.startsWith('##') && /active|tasks/i.test(trimmed)) {
      inActiveSection = true;
      continue;
    }
    if (trimmed.startsWith('##') && /completed|done/i.test(trimmed)) {
      inActiveSection = false;
      continue;
    }

    // Skip if not in active section
    if (!inActiveSection) {
      continue;
    }

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('<!--') || trimmed.startsWith('-->')) {
      continue;
    }

    // Parse task
    if (trimmed.startsWith('- [ ]') || trimmed.startsWith('* [ ]')) {
      // Uncompleted task
      if (currentTask) {
        tasks.push(currentTask);
      }
      const taskText = trimmed.replace(/^[-*]\s*\[\]\s*/, '');
      currentTask = {
        title: taskText,
        completed: false,
      };
    } else if (trimmed.startsWith('- [x]') || trimmed.startsWith('* [x]')) {
      // Completed task
      if (currentTask) {
        tasks.push(currentTask);
      }
      const taskText = trimmed.replace(/^[-*]\s*\[[xX]\]\s*/, '');
      currentTask = {
        title: taskText,
        completed: true,
      };
    } else if (trimmed.startsWith('#')) {
      // Header - treat as task category
      if (currentTask) {
        tasks.push(currentTask);
      }
      currentTask = {
        title: trimmed.replace(/^#+\s*/, ''),
        completed: false,
      };
    } else if (currentTask) {
      // Continuation of current task
      currentTask.description = (currentTask.description || '') + '\n' + trimmed;
    } else if (trimmed) {
      // Standalone text
      tasks.push({
        description: trimmed,
        completed: false,
      });
    }
  }

  if (currentTask) {
    tasks.push(currentTask);
  }

  return tasks;
}

// ============================================================================
// HeartbeatService
// ============================================================================

export class HeartbeatService {
  private workspacePath: string;
  private onHeartbeat: HeartbeatCallback | null;
  private intervalSeconds: number;
  private enabled: boolean;
  private running = false;
  private timerHandle: NodeJS.Timeout | null = null;

  constructor(
    config: HeartbeatConfig,
    onHeartbeat: HeartbeatCallback | null = null
  ) {
    this.workspacePath = config.workspace_path;
    this.onHeartbeat = onHeartbeat;
    this.intervalSeconds = config.interval_seconds || DEFAULT_HEARTBEAT_INTERVAL_S;
    this.enabled = config.enabled !== false;
  }

  get heartbeatFilePath(): string {
    return join(this.workspacePath, 'HEARTBEAT.md');
  }

  private async readHeartbeatFile(): Promise<string | null> {
    try {
      return await readFile(this.heartbeatFilePath, 'utf-8');
    } catch {
      return null;
    }
  }

  /**
   * Start the heartbeat service
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('[HeartbeatService] Disabled');
      return;
    }

    this.running = true;
    this.armTimer();
    console.log(`[HeartbeatService] Started (every ${this.intervalSeconds}s)`);
  }

  /**
   * Stop the heartbeat service
   */
  stop(): void {
    this.running = false;
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }
  }

  private armTimer(): void {
    if (this.timerHandle) {
      clearTimeout(this.timerHandle);
      this.timerHandle = null;
    }

    if (!this.running) {
      return;
    }

    this.timerHandle = setTimeout(() => {
      if (this.running) {
        this.tick().catch(console.error);
      }
    }, this.intervalSeconds * 1000);
  }

  private async tick(): Promise<void> {
    const content = await this.readHeartbeatFile();

    // Skip if HEARTBEAT.md is empty or doesn't exist
    if (isHeartbeatEmpty(content)) {
      console.log('[HeartbeatService] No tasks (HEARTBEAT.md empty)');
      this.armTimer();
      return;
    }

    console.log('[HeartbeatService] Checking for tasks...');

    // Parse tasks
    const tasks = parseHeartbeatTasks(content || '');
    const activeTasks = tasks.filter(t => !t.completed);

    if (activeTasks.length === 0) {
      console.log('[HeartbeatService] No active tasks');
      this.armTimer();
      return;
    }

    console.log(`[HeartbeatService] Found ${activeTasks.length} active tasks`);

    // Execute heartbeat callback
    if (this.onHeartbeat) {
      try {
        const response = await this.onHeartbeat(HEARTBEAT_PROMPT);

        // Check if agent said "nothing to do"
        const normalizedResponse = response.toUpperCase().replace(/_/g, '');
        const normalizedToken = HEARTBEAT_OK_TOKEN.replace(/_/g, '');

        if (normalizedResponse.includes(normalizedToken)) {
          console.log('[HeartbeatService] OK (no action needed)');
        } else {
          console.log('[HeartbeatService] Completed task');
        }
      } catch (error: any) {
        console.error('[HeartbeatService] Execution failed:', error);
      }
    }

    this.armTimer();
  }

  /**
   * Manually trigger a heartbeat
   */
  async triggerNow(): Promise<string | null> {
    if (this.onHeartbeat) {
      return await this.onHeartbeat(HEARTBEAT_PROMPT);
    }
    return null;
  }

  /**
   * Get current heartbeat tasks
   */
  async getTasks(): Promise<HeartbeatTask[]> {
    const content = await this.readHeartbeatFile();
    return parseHeartbeatTasks(content || '');
  }

  /**
   * Check if heartbeat file is empty
   */
  async isEmpty(): Promise<boolean> {
    const content = await this.readHeartbeatFile();
    return isHeartbeatEmpty(content);
  }

  /**
   * Get service status
   */
  getStatus(): {
    enabled: boolean;
    running: boolean;
    interval_seconds: number;
    workspace_path: string;
    heartbeat_file_exists: boolean;
  } {
    return {
      enabled: this.enabled,
      running: this.running,
      interval_seconds: this.intervalSeconds,
      workspace_path: this.workspacePath,
      heartbeat_file_exists: true, // Could check with fs.existsSync
    };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let heartbeatServiceInstance: HeartbeatService | null = null;

export function getHeartbeatService(): HeartbeatService | null {
  return heartbeatServiceInstance;
}

export function setHeartbeatService(service: HeartbeatService | null): void {
  heartbeatServiceInstance = service;
}

export function resetHeartbeatService(): void {
  if (heartbeatServiceInstance) {
    heartbeatServiceInstance.stop();
    heartbeatServiceInstance = null;
  }
}
