/**
 * Scheduler IPC Handlers
 *
 * IPC handlers for the cron and heartbeat services
 */

import { ipcMain } from 'electron';
import { getCronService, getHeartbeatService } from '../scheduler';
import { CronSchedule } from '../scheduler/types';

/**
 * Register scheduler-related IPC handlers
 */
export function registerSchedulerHandlers(): void {
  const cronService = getCronService();

  // ============================================================================
  // Cron Service IPC
  // ============================================================================

  // Start cron service
  ipcMain.handle('cron:start', async () => {
    try {
      await cronService.start();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Stop cron service
  ipcMain.handle('cron:stop', async () => {
    try {
      cronService.stop();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get cron service status
  ipcMain.handle('cron:status', async () => {
    try {
      const status = await cronService.status();
      return { success: true, status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // List all cron jobs
  ipcMain.handle('cron:list', async (_event, includeDisabled = false) => {
    try {
      const jobs = await cronService.listJobs(includeDisabled);
      return { success: true, jobs };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get a specific cron job
  ipcMain.handle('cron:get', async (_event, jobId: string) => {
    try {
      const job = await cronService.getJob(jobId);
      if (!job) {
        return { success: false, error: `Job ${jobId} not found` };
      }
      return { success: true, job };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Add a new cron job
  ipcMain.handle('cron:add', async (_event, params: {
    name: string;
    schedule: CronSchedule;
    message: string;
    tools?: string[];
    delete_after_run?: boolean;
  }) => {
    try {
      const job = await cronService.addJob(
        params.name,
        params.schedule,
        params.message,
        {
          tools: params.tools,
          delete_after_run: params.delete_after_run,
        }
      );
      return { success: true, job };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Remove a cron job
  ipcMain.handle('cron:remove', async (_event, jobId: string) => {
    try {
      const removed = await cronService.removeJob(jobId);
      if (!removed) {
        return { success: false, error: `Job ${jobId} not found` };
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Enable or disable a cron job
  ipcMain.handle('cron:enable', async (_event, jobId: string, enabled = true) => {
    try {
      const job = await cronService.enableJob(jobId, enabled);
      if (!job) {
        return { success: false, error: `Job ${jobId} not found` };
      }
      return { success: true, job };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Manually run a cron job
  ipcMain.handle('cron:run', async (_event, jobId: string, force = false) => {
    try {
      const ran = await cronService.runJob(jobId, force);
      if (!ran) {
        return { success: false, error: `Job ${jobId} not found or disabled` };
      }
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Clear all cron jobs
  ipcMain.handle('cron:clear', async () => {
    try {
      await cronService.clearAll();
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ============================================================================
  // Heartbeat Service IPC
  // ============================================================================

  // Get heartbeat service status
  ipcMain.handle('heartbeat:status', async () => {
    try {
      const heartbeatService = getHeartbeatService();
      if (!heartbeatService) {
        return { success: false, error: 'Heartbeat service not initialized' };
      }
      const status = heartbeatService.getStatus();
      return { success: true, status };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Get heartbeat tasks
  ipcMain.handle('heartbeat:getTasks', async () => {
    try {
      const heartbeatService = getHeartbeatService();
      if (!heartbeatService) {
        return { success: false, error: 'Heartbeat service not initialized' };
      }
      const tasks = await heartbeatService.getTasks();
      return { success: true, tasks };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Trigger heartbeat manually
  ipcMain.handle('heartbeat:trigger', async () => {
    try {
      const heartbeatService = getHeartbeatService();
      if (!heartbeatService) {
        return { success: false, error: 'Heartbeat service not initialized' };
      }
      const result = await heartbeatService.triggerNow();
      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Check if heartbeat file is empty
  ipcMain.handle('heartbeat:isEmpty', async () => {
    try {
      const heartbeatService = getHeartbeatService();
      if (!heartbeatService) {
        return { success: false, error: 'Heartbeat service not initialized' };
      }
      const isEmpty = await heartbeatService.isEmpty();
      return { success: true, isEmpty };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Scheduler handlers registered');
}
