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
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getPathManager } from '../config/PathManager';
import {
  HeartbeatConfig,
  HeartbeatCallback,
  HeartbeatTask,
  DEFAULT_HEARTBEAT_INTERVAL_S,
  HEARTBEAT_OK_TOKEN,
  HEARTBEAT_PROMPT,
} from './types';

// ============================================================================
// 常量（P2-4）
// ============================================================================

/** MEMORY.md 超长阈值（行数） */
const MEMORY_INDEX_MAX_LINES = 200;

/** MEMORY.md 超长时注入的触发消息（替代 HEARTBEAT_PROMPT） */
const MEMORY_OVERSIZE_PROMPT = `MEMORY.md 已超过 200 行（当前 {N} 行），请把详细内容拆分到 topics/*.md，本文件只保留索引和链接。

**步骤**：
1. 先用 memory_read(target: 'index') 读取当前 MEMORY.md 全文
2. 识别哪些章节过于详细（如整段的调试日志、完整的项目说明）
3. 把详细内容用 memory_save 写到对应的 topics/*.md：
   - 用户偏好 → topics/user-profile.md
   - 项目事实 → topics/project-facts.md
   - 反复出现的 bug → topics/recurring-bugs.md
   - 调试经验 → topics/debugging-notes.md
4. 用 memory_save(topic: 'memory-index', mode: 'replace') 重写 MEMORY.md 为精简索引，每章节只保留 2-3 行总结 + 链接到 topics/*.md 的相对路径
5. 重写后 MEMORY.md 应 < 100 行

**注意**：不要丢失任何关键信息，只是从 MEMORY.md 移到 topics/。`;

// ============================================================================
// Utilities
// ============================================================================

/**
 * 计算 MEMORY.md 行数；若文件不存在返回 0（P2-4）
 */
function getMemoryIndexLineCount(): number {
  try {
    const indexPath = join(getPathManager().getMemoryPath(), 'MEMORY.md');
    if (!existsSync(indexPath)) {
      return 0;
    }
    const content = readFileSync(indexPath, 'utf-8');
    // 用 split('\n') 而非 match(/\n/g)，确保空文件返回 0 而非 undefined
    return content.split('\n').length;
  } catch {
    return 0;
  }
}

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
      // P2-4: 检查 MEMORY.md 行数；超长则改用 MEMORY 整理 prompt
      let prompt = HEARTBEAT_PROMPT;
      try {
        const lineCount = getMemoryIndexLineCount();
        if (lineCount > MEMORY_INDEX_MAX_LINES) {
          prompt = MEMORY_OVERSIZE_PROMPT.replace('{N}', String(lineCount));
          console.log(`[HeartbeatService] MEMORY.md 行数 ${lineCount} > ${MEMORY_INDEX_MAX_LINES}，改用 MEMORY 整理 prompt`);
        }
      } catch (e: any) {
        console.warn('[HeartbeatService] 检查 MEMORY.md 行数失败（非致命）:', e?.message || e);
      }

      try {
        const response = await this.onHeartbeat(prompt);

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
