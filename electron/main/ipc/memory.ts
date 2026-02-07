/**
 * Memory IPC Handlers
 *
 * IPC handlers for the memory system
 */

import { ipcMain } from 'electron';
import { getMemoryStore } from '../memory/MemoryStore';

/**
 * Register memory-related IPC handlers
 */
export function registerMemoryHandlers(): void {
  const memoryStore = getMemoryStore();

  // Get long-term memory
  ipcMain.handle('memory:getLongTerm', async () => {
    try {
      const content = await memoryStore.getLongTermMemory();
      return {
        success: true,
        content,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Add long-term memory
  ipcMain.handle('memory:addLongTerm', async (_event, content: string, tags?: string[]) => {
    try {
      await memoryStore.addLongTermMemory(content, tags);
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get today's note
  ipcMain.handle('memory:getTodayNote', async () => {
    try {
      const content = await memoryStore.getTodayNote();
      return {
        success: true,
        content,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Add today's note
  ipcMain.handle('memory:addTodayNote', async (_event, content: string) => {
    try {
      await memoryStore.addTodayNote(content);
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get daily note for specific date
  ipcMain.handle('memory:getDailyNote', async (_event, dateString: string) => {
    try {
      const date = new Date(dateString);
      const content = await memoryStore.getDailyNote(date);
      return {
        success: true,
        content,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Add daily note for specific date
  ipcMain.handle('memory:addDailyNote', async (_event, content: string, dateString: string) => {
    try {
      const date = new Date(dateString);
      await memoryStore.addDailyNote(content, date);
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get recent notes
  ipcMain.handle('memory:getRecentNotes', async (_event, days: number = 7) => {
    try {
      const notes = await memoryStore.getRecentNotes(days);
      // Convert Map to object for JSON serialization
      const notesObj: Record<string, string> = {};
      notes.forEach((content, date) => {
        notesObj[date] = content;
      });
      return {
        success: true,
        notes: notesObj,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Search memories
  ipcMain.handle('memory:search', async (_event, query: string, options?: {
    types?: Array<'long_term' | 'daily_note'>;
    maxDays?: number;
    maxResults?: number;
  }) => {
    try {
      const results = await memoryStore.searchMemories(query, options);
      return {
        success: true,
        results,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Build memory context
  ipcMain.handle('memory:buildContext', async () => {
    try {
      const context = await memoryStore.buildMemoryContext();
      return {
        success: true,
        context,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Delete memory
  ipcMain.handle('memory:delete', async (_event, type: 'long_term' | 'daily_note', dateString?: string) => {
    try {
      const date = dateString ? new Date(dateString) : undefined;
      const deleted = await memoryStore.deleteMemory(type, date);
      return {
        success: deleted,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get memory statistics
  ipcMain.handle('memory:getStats', async () => {
    try {
      const stats = await memoryStore.getStats();
      return {
        success: true,
        stats,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Clear all memories
  ipcMain.handle('memory:clearAll', async () => {
    try {
      await memoryStore.clearAll();
      return {
        success: true,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Memory handlers registered');
}
