/**
 * Scheduler Tools - Cron tools for agents to schedule tasks
 *
 * Based on nanobot architecture:
 * - https://github.com/nanobot-xyz/nanobot
 *
 * These tools allow agents to schedule their own tasks and reminders.
 */

import { getCronService } from '../scheduler';
import { CronSchedule } from '../scheduler/types';
import { Tool } from './ToolManager';

// ============================================================================
// Cron Tool
// ============================================================================

export const cronTools: Tool[] = [
  {
    name: 'cron_add',
    description: 'Schedule a new cron job. Use this to create reminders or recurring tasks.',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Short name for the job (e.g., "morning reminder")',
        },
        message: {
          type: 'string',
          description: 'Message or task to execute when the job runs',
        },
        every_seconds: {
          type: 'number',
          description: 'Interval in seconds for recurring tasks (e.g., 3600 for every hour)',
        },
        cron_expr: {
          type: 'string',
          description: 'Cron expression like "0 9 * * *" for daily at 9 AM. Format: min hour day month dow',
        },
        at_timestamp: {
          type: 'number',
          description: 'Unix timestamp in milliseconds for one-time tasks',
        },
      },
    },
    handler: async (args) => {
      const { name, message, every_seconds, cron_expr, at_timestamp } = args;

      if (!name || !message) {
        return {
          success: false,
          error: 'name and message are required',
        };
      }

      const cronService = getCronService();

      // Determine schedule type
      let schedule: CronSchedule;

      if (at_timestamp) {
        schedule = {
          kind: 'at',
          at_ms: at_timestamp,
        };
      } else if (every_seconds) {
        schedule = {
          kind: 'every',
          every_ms: every_seconds * 1000,
        };
      } else if (cron_expr) {
        schedule = {
          kind: 'cron',
          expr: cron_expr,
        };
      } else {
        return {
          success: false,
          error: 'Either every_seconds, cron_expr, or at_timestamp is required',
        };
      }

      try {
        const job = await cronService.addJob(name, schedule, message);
        return {
          success: true,
          job: {
            id: job.id,
            name: job.name,
            schedule: job.schedule,
            next_run: job.state.next_run_at_ms,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  {
    name: 'cron_list',
    description: 'List all scheduled cron jobs',
    parameters: {
      type: 'object',
      properties: {
        include_disabled: {
          type: 'boolean',
          description: 'Include disabled jobs in the list',
        },
      },
    },
    handler: async (args) => {
      const cronService = getCronService();
      const includeDisabled = args.include_disabled || false;

      try {
        const jobs = await cronService.listJobs(includeDisabled);

        if (jobs.length === 0) {
          return {
            success: true,
            message: 'No scheduled jobs found',
            jobs: [],
          };
        }

        const jobList = jobs.map(job => ({
          id: job.id,
          name: job.name,
          enabled: job.enabled,
          schedule: job.schedule,
          next_run: job.state.next_run_at_ms,
          last_run: job.state.last_run_at_ms,
          last_status: job.state.last_status,
        }));

        return {
          success: true,
          message: `Found ${jobs.length} scheduled job(s)`,
          jobs: jobList,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  {
    name: 'cron_remove',
    description: 'Remove a scheduled cron job by ID',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'ID of the job to remove',
        },
      },
      required: ['job_id'],
    },
    handler: async (args) => {
      const { job_id } = args;

      if (!job_id) {
        return {
          success: false,
          error: 'job_id is required',
        };
      }

      const cronService = getCronService();

      try {
        const removed = await cronService.removeJob(job_id);
        if (!removed) {
          return {
            success: false,
            error: `Job ${job_id} not found`,
          };
        }

        return {
          success: true,
          message: `Job ${job_id} has been removed`,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  {
    name: 'cron_enable',
    description: 'Enable or disable a cron job',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'ID of the job to enable/disable',
        },
        enabled: {
          type: 'boolean',
          description: 'true to enable, false to disable',
        },
      },
      required: ['job_id', 'enabled'],
    },
    handler: async (args) => {
      const { job_id, enabled } = args;

      if (!job_id || typeof enabled !== 'boolean') {
        return {
          success: false,
          error: 'job_id and enabled are required',
        };
      }

      const cronService = getCronService();

      try {
        const job = await cronService.enableJob(job_id, enabled);
        if (!job) {
          return {
            success: false,
            error: `Job ${job_id} not found`,
          };
        }

        return {
          success: true,
          message: `Job ${job_id} has been ${enabled ? 'enabled' : 'disabled'}`,
          job: {
            id: job.id,
            name: job.name,
            enabled: job.enabled,
            next_run: job.state.next_run_at_ms,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  {
    name: 'cron_run',
    description: 'Manually trigger a cron job to run immediately',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'ID of the job to run',
        },
        force: {
          type: 'boolean',
          description: 'Run even if the job is disabled',
        },
      },
      required: ['job_id'],
    },
    handler: async (args) => {
      const { job_id, force = false } = args;

      if (!job_id) {
        return {
          success: false,
          error: 'job_id is required',
        };
      }

      const cronService = getCronService();

      try {
        const ran = await cronService.runJob(job_id, force);
        if (!ran) {
          return {
            success: false,
            error: `Job ${job_id} not found or disabled (use force=true to run disabled jobs)`,
          };
        }

        return {
          success: true,
          message: `Job ${job_id} has been triggered`,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  {
    name: 'cron_status',
    description: 'Get the current status of the cron service',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const cronService = getCronService();

      try {
        const status = await cronService.status();
        return {
          success: true,
          status: {
            enabled: status.enabled,
            jobs: status.jobs,
            next_wake: status.next_wake_at_ms,
            next_wake_formatted: status.next_wake_at_ms
              ? new Date(status.next_wake_at_ms).toLocaleString('zh-CN')
              : 'No scheduled jobs',
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  {
    name: 'cron_clear',
    description: 'Clear all scheduled cron jobs',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const cronService = getCronService();

      try {
        await cronService.clearAll();
        return {
          success: true,
          message: 'All cron jobs have been cleared',
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },
];

// ============================================================================
// Heartbeat Tool
// ============================================================================

export const heartbeatTools: Tool[] = [
  {
    name: 'heartbeat_status',
    description: 'Get the current status of the heartbeat service',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const { getHeartbeatService } = await import('../scheduler');
      const heartbeatService = getHeartbeatService();

      if (!heartbeatService) {
        return {
          success: false,
          error: 'Heartbeat service is not initialized',
        };
      }

      try {
        const status = heartbeatService.getStatus();
        const isEmpty = await heartbeatService.isEmpty();
        const tasks = await heartbeatService.getTasks();

        return {
          success: true,
          status: {
            ...status,
            is_empty: isEmpty,
            active_tasks: tasks.filter(t => !t.completed).length,
            total_tasks: tasks.length,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  {
    name: 'heartbeat_get_tasks',
    description: 'Get all tasks from the HEARTBEAT.md file',
    parameters: {
      type: 'object',
      properties: {
        active_only: {
          type: 'boolean',
          description: 'Only return active (non-completed) tasks',
        },
      },
    },
    handler: async (args) => {
      const { getHeartbeatService } = await import('../scheduler');
      const heartbeatService = getHeartbeatService();

      if (!heartbeatService) {
        return {
          success: false,
          error: 'Heartbeat service is not initialized',
        };
      }

      try {
        const tasks = await heartbeatService.getTasks();
        const activeOnly = args.active_only || false;

        const filteredTasks = activeOnly
          ? tasks.filter(t => !t.completed)
          : tasks;

        return {
          success: true,
          tasks: filteredTasks,
          count: filteredTasks.length,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  {
    name: 'heartbeat_trigger',
    description: 'Manually trigger the heartbeat check',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      const { getHeartbeatService } = await import('../scheduler');
      const heartbeatService = getHeartbeatService();

      if (!heartbeatService) {
        return {
          success: false,
          error: 'Heartbeat service is not initialized',
        };
      }

      try {
        const result = await heartbeatService.triggerNow();
        return {
          success: true,
          result,
          message: result
            ? result.includes('HEARTBEAT_OK')
              ? 'Heartbeat completed: nothing to do'
              : 'Heartbeat completed: task executed'
            : 'Heartbeat completed',
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },
];
