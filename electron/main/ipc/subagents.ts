/**
 * Subagent IPC Handlers
 *
 * IPC handlers for the subagent system
 */

import { ipcMain } from 'electron';
import { getSubagentManager } from '../subagents/SubagentManager';

/**
 * Register subagent-related IPC handlers
 */
export function registerSubagentHandlers(): void {
  const subagentManager = getSubagentManager();

  // Spawn a new subagent task
  ipcMain.handle('subagents:spawn', async (
    _event,
    task: string,
    label: string,
    parentSessionId: string,
    llmConfig: {
      baseUrl: string;
      apiKey: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    },
    options?: {
      timeout?: number;
      maxIterations?: number;
    }
  ) => {
    try {
      const taskId = await subagentManager.spawn(task, label, parentSessionId, llmConfig, options);
      return {
        success: true,
        taskId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get task status
  ipcMain.handle('subagents:getStatus', async (_event, taskId: string) => {
    try {
      const task = subagentManager.getTaskStatus(taskId);
      if (!task) {
        return {
          success: false,
          error: `Task ${taskId} not found`,
        };
      }
      return {
        success: true,
        task,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get task result
  ipcMain.handle('subagents:getResult', async (_event, taskId: string) => {
    try {
      const result = subagentManager.getTaskResult(taskId);
      if (!result) {
        return {
          success: false,
          error: `Task ${taskId} not found`,
        };
      }
      return {
        success: true,
        result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get tasks for a session
  ipcMain.handle('subagents:getBySession', async (_event, parentSessionId: string) => {
    try {
      const tasks = subagentManager.getTasksBySession(parentSessionId);
      return {
        success: true,
        tasks,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get all running tasks
  ipcMain.handle('subagents:getRunning', async () => {
    try {
      const tasks = subagentManager.getRunningTasks();
      return {
        success: true,
        tasks,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Cancel a task
  ipcMain.handle('subagents:cancel', async (_event, taskId: string) => {
    try {
      const cancelled = subagentManager.cancelTask(taskId);
      return {
        success: cancelled,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Wait for task completion
  ipcMain.handle('subagents:waitFor', async (_event, taskId: string, timeout?: number) => {
    try {
      const result = await subagentManager.waitForTask(taskId, timeout);
      return {
        success: true,
        result,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Retry a failed task
  ipcMain.handle('subagents:retry', async (_event, taskId: string) => {
    try {
      const newTaskId = await subagentManager.retryTask(taskId);
      if (!newTaskId) {
        return {
          success: false,
          error: `Cannot retry task ${taskId}`,
        };
      }
      return {
        success: true,
        newTaskId,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Clean up old tasks
  ipcMain.handle('subagents:cleanup', async (_event, maxAge?: number) => {
    try {
      const cleaned = subagentManager.cleanOldTasks(maxAge);
      return {
        success: true,
        cleaned,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Get subagent statistics
  ipcMain.handle('subagents:getStats', async () => {
    try {
      const stats = subagentManager.getStats();
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

  // Clear all tasks
  ipcMain.handle('subagents:clearAll', async () => {
    try {
      subagentManager.clear();
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

  console.log('[IPC] Subagent handlers registered');
}
