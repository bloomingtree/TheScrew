/**
 * Memory Store - nanobot style memory system
 *
 * Responsibilities:
 * - Manage long-term memory (long_term.md)
 * - Manage daily notes (daily_notes/YYYY-MM-DD.md)
 * - Add/retrieve memories
 * - Search memories
 */

import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import { existsSync, mkdirSync, renameSync, copyFileSync } from 'fs';
import { IMemoryEntry, IMemorySearchResult, MemoryEntryType } from '../core/types';
import { getPathManager } from '../config/PathManager';

/**
 * MEMORY.md 索引的行数上限（超过即应瘦身，把低频内容下沉到 topics/）。
 * 统一来源：ContextBuilder 行为规范、HeartbeatService 超长检测、默认模板均引用此常量。
 */
export const MEMORY_INDEX_MAX_LINES = 200;

/**
 * 默认 MEMORY.md 模板（首次创建时写入）
 */
const DEFAULT_MEMORY_INDEX_TEMPLATE = `<!-- 长期记忆索引：每次会话自动注入上下文。用文件工具直接编辑（namespace="config"） -->
# 记忆索引

> 这是你的长期记忆索引。每次启动都会自动加载到对话上下文。
>
> 规则：
> - 一行一条浓缩摘要，细节放在 topics/*.md 对应文件中，本文件只保留索引和链接
> - 超过 ${MEMORY_INDEX_MAX_LINES} 行时把低频内容下沉到 topics/ 文件
> - 写入前先用 grep（namespace="config", path="memory"）查重，已有条目用 edit 原地更新
> - 只记录"反复出现的偏好"、"关键决策"、"重要事实"；不要记录临时状态

## 用户偏好

（待补充）

## 项目事实

（待补充）

## 常见问题

（待补充）
`;

/**
 * Memory Store - long-term memory and daily notes
 *
 * P0 重构：存储路径从 app.getPath('userData')/memory 迁移到 PathManager.getMemoryPath()，
 * 即 {configPath}/memory/。统一目录结构：daily/、topics/、archive/、session_summaries/。
 */
export class MemoryStore {
  private memoryPath: string;
  private dailyNotesPath: string;
  private initialized: boolean = false;

  constructor() {
    const pathManager = getPathManager();
    this.memoryPath = pathManager.getMemoryPath();
    this.dailyNotesPath = join(this.memoryPath, 'daily');

    // 确保子目录存在（同步，constructor 中不能 await）
    const requiredDirs = [
      this.memoryPath,
      this.dailyNotesPath,
      join(this.memoryPath, 'topics'),
      join(this.memoryPath, 'archive'),
      join(this.memoryPath, 'session_summaries'),
    ];
    for (const dir of requiredDirs) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // 一次性迁移：旧 userData/memory/long_term.md → 新位置
    this.migrateLegacyLongTerm();

    // 确保 MEMORY.md 索引文件存在
    this.ensureMemoryIndexFile();
  }

  /**
   * 一次性迁移旧版 long_term.md（位于 userData/memory/）到新位置
   * - 若新位置尚无 long_term.md，且旧位置存在，则复制过来
   * - 不删除旧文件，避免回滚风险（用户可手动清理）
   */
  private migrateLegacyLongTerm(): void {
    try {
      const newLongTermPath = join(this.memoryPath, 'long_term.md');
      if (existsSync(newLongTermPath)) {
        return; // 新位置已有，跳过
      }
      const legacyUserDataPath = app.getPath('userData');
      const legacyLongTermPath = join(legacyUserDataPath, 'memory', 'long_term.md');
      if (existsSync(legacyLongTermPath)) {
        copyFileSync(legacyLongTermPath, newLongTermPath);
        console.log('[MemoryStore] Migrated legacy long_term.md from userData to', newLongTermPath);

        // 同时尝试迁移旧 daily_notes/ 目录下的 .md 文件到新 daily/
        const legacyDailyNotesPath = join(legacyUserDataPath, 'memory', 'daily_notes');
        if (existsSync(legacyDailyNotesPath)) {
          try {
            const { readdirSync } = require('fs');
            const files = readdirSync(legacyDailyNotesPath) as string[];
            for (const file of files) {
              if (file.endsWith('.md')) {
                const src = join(legacyDailyNotesPath, file);
                const dest = join(this.dailyNotesPath, file);
                if (!existsSync(dest)) {
                  copyFileSync(src, dest);
                }
              }
            }
            console.log('[MemoryStore] Migrated legacy daily_notes/ files');
          } catch (e) {
            console.warn('[MemoryStore] Failed to migrate legacy daily_notes:', e);
          }
        }
      }
    } catch (e) {
      console.warn('[MemoryStore] Legacy migration failed (non-fatal):', e);
    }
  }

  /**
   * 确保 MEMORY.md 索引文件存在；不存在则写入默认模板
   */
  private ensureMemoryIndexFile(): void {
    try {
      const indexPath = join(this.memoryPath, 'MEMORY.md');
      if (!existsSync(indexPath)) {
        const { writeFileSync } = require('fs');
        writeFileSync(indexPath, DEFAULT_MEMORY_INDEX_TEMPLATE, 'utf-8');
        console.log('[MemoryStore] Created default MEMORY.md at', indexPath);
      }
    } catch (e) {
      console.warn('[MemoryStore] Failed to ensure MEMORY.md:', e);
    }
  }

  /**
   * Initialize - directories now created in constructor; kept for backward compat
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    // 目录已在 constructor 中通过 mkdirSync 创建，这里只做标记
    this.initialized = true;
    console.log('[MemoryStore] Initialized at', this.memoryPath);
  }

  /**
   * Get long-term memory file path
   */
  private getLongTermPath(): string {
    return join(this.memoryPath, 'long_term.md');
  }

  /**
   * Get daily note file path for a specific date
   */
  private getDailyNotePath(date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    return join(this.dailyNotesPath, `${dateStr}.md`);
  }

  /**
   * Get today's note file path
   */
  private getTodayNotePath(): string {
    return this.getDailyNotePath(new Date());
  }

  /**
   * Read long-term memory
   */
  async getLongTermMemory(): Promise<string> {
    await this.initialize();

    const path = this.getLongTermPath();

    if (!existsSync(path)) {
      return '# Long-term Memory\n\nNo long-term memories yet.';
    }

    return await readFile(path, 'utf-8');
  }

  /**
   * Add long-term memory
   */
  async addLongTermMemory(content: string, tags?: string[]): Promise<void> {
    await this.initialize();

    const path = this.getLongTermPath();
    const timestamp = new Date().toISOString();
    const tagLine = tags && tags.length > 0 ? ` Tags: ${tags.join(', ')}` : '';
    const entry = `\n## ${timestamp}${tagLine}\n\n${content}\n`;

    let existing = '';
    if (existsSync(path)) {
      existing = await readFile(path, 'utf-8');
    } else {
      existing = '# Long-term Memory\n\n';
    }

    await writeFile(path, existing + entry, 'utf-8');
    console.log('[MemoryStore] Added long-term memory');
  }

  /**
   * Read today's note
   */
  async getTodayNote(): Promise<string> {
    await this.initialize();

    const path = this.getTodayNotePath();

    if (!existsSync(path)) {
      const today = new Date().toISOString().split('T')[0];
      return `# Daily Notes - ${today}\n\nNo notes for today yet.`;
    }

    return await readFile(path, 'utf-8');
  }

  /**
   * Add today's note
   */
  async addTodayNote(content: string): Promise<void> {
    await this.initialize();

    const path = this.getTodayNotePath();
    const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const entry = `\n## ${timestamp}\n\n${content}\n`;

    let existing = '';
    if (existsSync(path)) {
      existing = await readFile(path, 'utf-8');
    } else {
      const today = new Date().toISOString().split('T')[0];
      existing = `# Daily Notes - ${today}\n`;
    }

    await writeFile(path, existing + entry, 'utf-8');
    console.log('[MemoryStore] Added today note');
  }

  /**
   * Add note for a specific date
   */
  async addDailyNote(content: string, date: Date): Promise<void> {
    await this.initialize();

    const path = this.getDailyNotePath(date);
    const timestamp = date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
    const entry = `\n## ${timestamp}\n\n${content}\n`;

    let existing = '';
    if (existsSync(path)) {
      existing = await readFile(path, 'utf-8');
    } else {
      const dateStr = date.toISOString().split('T')[0];
      existing = `# Daily Notes - ${dateStr}\n`;
    }

    await writeFile(path, existing + entry, 'utf-8');
    console.log(`[MemoryStore] Added note for date: ${date.toISOString().split('T')[0]}`);
  }

  /**
   * Read note for a specific date
   */
  async getDailyNote(date: Date): Promise<string> {
    await this.initialize();

    const path = this.getDailyNotePath(date);

    if (!existsSync(path)) {
      const dateStr = date.toISOString().split('T')[0];
      return `# Daily Notes - ${dateStr}\n\nNo notes for this date.`;
    }

    return await readFile(path, 'utf-8');
  }

  /**
   * Get recent daily notes (last N days)
   */
  async getRecentNotes(days: number = 7): Promise<Map<string, string>> {
    await this.initialize();

    const notes = new Map<string, string>();
    const today = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const content = await this.getDailyNote(date);
      notes.set(dateStr, content);
    }

    return notes;
  }

  /**
   * Search memories
   */
  async searchMemories(query: string, options?: {
    types?: MemoryEntryType[];
    maxDays?: number;
    maxResults?: number;
  }): Promise<IMemorySearchResult[]> {
    await this.initialize();

    const results: IMemorySearchResult[] = [];
    const lowerQuery = query.toLowerCase();
    const types = options?.types || ['long_term', 'daily_note'];
    const maxDays = options?.maxDays || 30;
    const maxResults = options?.maxResults || 20;

    // Search long-term memory
    if (types.includes('long_term')) {
      const longTermPath = this.getLongTermPath();
      if (existsSync(longTermPath)) {
        const content = await readFile(longTermPath, 'utf-8');
        if (content.toLowerCase().includes(lowerQuery)) {
          results.push({
            entry: {
              id: 'long_term',
              type: 'long_term',
              content: this.extractRelevantSection(content, query),
              timestamp: 0,
            },
            relevance: this.calculateRelevance(content, query),
            excerpt: this.extractRelevantSection(content, query, 200),
          });
        }
      }
    }

    // Search daily notes
    if (types.includes('daily_note')) {
      const files = await readdir(this.dailyNotesPath);
      const sortedFiles = files.sort().reverse(); // Most recent first

      let checkedDays = 0;
      for (const file of sortedFiles) {
        if (checkedDays >= maxDays) break;

        const filePath = join(this.dailyNotesPath, file);
        const content = await readFile(filePath, 'utf-8');

        if (content.toLowerCase().includes(lowerQuery)) {
          const dateStr = file.replace('.md', '');
          results.push({
            entry: {
              id: file,
              type: 'daily_note',
              content: this.extractRelevantSection(content, query),
              timestamp: Date.parse(dateStr),
            },
            relevance: this.calculateRelevance(content, query),
            excerpt: this.extractRelevantSection(content, query, 200),
          });
        }

        checkedDays++;
      }
    }

    // Sort by relevance and limit results
    results.sort((a, b) => b.relevance - a.relevance);
    return results.slice(0, maxResults);
  }

  /**
   * Extract relevant section from content
   */
  private extractRelevantSection(content: string, query: string, maxLength: number = 500): string {
    const lines = content.split('\n');
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);

    // Find the most relevant section
    let bestScore = 0;
    let bestStart = 0;
    let bestEnd = 0;

    for (let i = 0; i < lines.length; i++) {
      let score = 0;
      let start = i;
      let end = i;

      // Score consecutive lines
      for (let j = i; j < Math.min(i + 10, lines.length); j++) {
        const line = lines[j].toLowerCase();
        for (const word of queryWords) {
          if (line.includes(word)) {
            score++;
          }
        }
        end = j;

        // Stop if no more relevant content
        if (j > i && score === 0) break;
      }

      if (score > bestScore) {
        bestScore = score;
        bestStart = start;
        bestEnd = end + 1;
      }
    }

    // Extract the best section
    let excerpt = lines.slice(Math.max(0, bestStart - 2), bestEnd + 3).join('\n');

    // Truncate if too long
    if (excerpt.length > maxLength) {
      excerpt = excerpt.slice(0, maxLength) + '...';
    }

    return excerpt;
  }

  /**
   * Calculate relevance score
   */
  private calculateRelevance(content: string, query: string): number {
    const lowerContent = content.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const queryWords = lowerQuery.split(/\s+/).filter(w => w.length > 2);

    let score = 0;
    for (const word of queryWords) {
      const occurrences = (lowerContent.match(new RegExp(word, 'g')) || []).length;
      score += occurrences * (word.length > 4 ? 2 : 1);
    }

    return score;
  }

  /**
   * Build memory context for system prompt
   */
  async buildMemoryContext(): Promise<string> {
    await this.initialize();

    const parts: string[] = [];

    // Long-term memory
    const longTerm = await this.getLongTermMemory();
    if (longTerm && !longTerm.includes('No long-term memories')) {
      parts.push(`# Long-term Memory\n\n${longTerm}`);
    }

    // Today's notes
    const todayNote = await this.getTodayNote();
    if (todayNote && !todayNote.includes('No notes for today')) {
      parts.push(`# Today's Notes\n\n${todayNote}`);
    }

    if (parts.length === 0) {
      return '';
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Delete a memory entry
   */
  async deleteMemory(type: MemoryEntryType, date?: Date): Promise<boolean> {
    await this.initialize();

    try {
      if (type === 'long_term') {
        const path = this.getLongTermPath();
        if (existsSync(path)) {
          await writeFile(path, '# Long-term Memory\n\n', 'utf-8');
          return true;
        }
      } else if (type === 'daily_note' && date) {
        const path = this.getDailyNotePath(date);
        if (existsSync(path)) {
          const { unlink } = require('fs/promises');
          await unlink(path);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('[MemoryStore] Failed to delete memory:', error);
      return false;
    }
  }

  /**
   * Get memory statistics
   */
  async getStats(): Promise<{
    longTermMemorySize: number;
    dailyNotesCount: number;
    totalMemories: number;
  }> {
    await this.initialize();

    let longTermMemorySize = 0;
    const longTermPath = this.getLongTermPath();
    if (existsSync(longTermPath)) {
      const content = await readFile(longTermPath, 'utf-8');
      longTermMemorySize = content.length;
    }

    const files = await readdir(this.dailyNotesPath);
    const dailyNotesCount = files.filter(f => f.endsWith('.md')).length;

    return {
      longTermMemorySize,
      dailyNotesCount,
      totalMemories: longTermMemorySize > 0 ? 1 : 0 + dailyNotesCount,
    };
  }

  /**
   * Clear all memories
   */
  async clearAll(): Promise<void> {
    await this.initialize();

    // Clear long-term memory
    const longTermPath = this.getLongTermPath();
    if (existsSync(longTermPath)) {
      await writeFile(longTermPath, '# Long-term Memory\n\n', 'utf-8');
    }

    // Clear all daily notes
    const files = await readdir(this.dailyNotesPath);
    const { unlink } = require('fs/promises');
    for (const file of files) {
      if (file.endsWith('.md')) {
        await unlink(join(this.dailyNotesPath, file));
      }
    }

    console.log('[MemoryStore] Cleared all memories');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let memoryStoreInstance: MemoryStore | null = null;

/**
 * Get the singleton MemoryStore instance
 */
export function getMemoryStore(): MemoryStore {
  if (!memoryStoreInstance) {
    memoryStoreInstance = new MemoryStore();
  }
  return memoryStoreInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetMemoryStore(): void {
  memoryStoreInstance = null;
}

export default MemoryStore;
