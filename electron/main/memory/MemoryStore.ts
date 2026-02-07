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
import { existsSync } from 'fs';
import { IMemoryEntry, IMemorySearchResult, MemoryEntryType } from '../core/types';

/**
 * Memory Store - long-term memory and daily notes
 */
export class MemoryStore {
  private memoryPath: string;
  private dailyNotesPath: string;
  private initialized: boolean = false;

  constructor() {
    const userDataPath = app.getPath('userData');
    this.memoryPath = join(userDataPath, 'memory');
    this.dailyNotesPath = join(this.memoryPath, 'daily_notes');
  }

  /**
   * Initialize - create necessary directories
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (!existsSync(this.memoryPath)) {
      await mkdir(this.memoryPath, { recursive: true });
      console.log('[MemoryStore] Created memory directory:', this.memoryPath);
    }

    if (!existsSync(this.dailyNotesPath)) {
      await mkdir(this.dailyNotesPath, { recursive: true });
      console.log('[MemoryStore] Created daily notes directory:', this.dailyNotesPath);
    }

    this.initialized = true;
    console.log('[MemoryStore] Initialized');
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
