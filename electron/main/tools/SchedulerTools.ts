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
    description: '创建定时任务。target="user" 用于提醒用户做事（弹通知+注入对话，不触发agent执行）；target="agent" 用于让agent在后台自主执行周期任务（如每日总结、整理记忆、巡检待办）。时间参数三选一：at_timestamp（一次性）/every_seconds（周期）/cron_expr（cron表达式）。',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '任务名称（简短，如"汇报提醒"、"每日工作总结"）',
        },
        message: {
          type: 'string',
          description: '任务内容。target=user 时是提醒文本（如"去给领导汇报"）；target=agent 时是 agent 要执行的 prompt（如"总结今天所有对话并提取关键信息"）',
        },
        target: {
          type: 'string',
          enum: ['user', 'agent'],
          description: '任务目标：user=提醒用户（默认）；agent=agent 自主执行',
        },
        every_seconds: {
          type: 'number',
          description: '周期任务的间隔秒数（如 3600=每小时、86400=每天）',
        },
        cron_expr: {
          type: 'string',
          description: 'cron 表达式，格式"分 时 日 月 周"，如"0 9 * * *"=每天9点。AI 设定时间时优先用此参数。',
        },
        at_timestamp: {
          type: ['number', 'string'],
          description: '一次性任务的时间。支持：毫秒时间戳(number)、日期时间字符串(string，如"2026-06-14 10:05:00"、"10:30"、"2026-06-14T10:05:00")',
        },
        agentType: {
          type: 'string',
          enum: ['default', 'office', 'devops', 'secretary'],
          description: 'target=agent 时可选的 agent 类型，默认 default',
        },
      },
    },
    handler: async (args) => {
      const { name, message, target, every_seconds, cron_expr, at_timestamp, agentType } = args;

      if (!name || !message) {
        return {
          success: false,
          error: 'name and message are required',
        };
      }

      const cronService = getCronService();
      const jobTarget: 'user' | 'agent' = target === 'agent' ? 'agent' : 'user';

      // 解析 at_timestamp（兼容 number 和 string 两种格式）
      let atMs: number | undefined;
      if (at_timestamp !== undefined && at_timestamp !== null && at_timestamp !== '') {
        if (typeof at_timestamp === 'number') {
          atMs = at_timestamp;
        } else if (typeof at_timestamp === 'string') {
          const trimmed = at_timestamp.trim();
          // 纯数字字符串 → 当作毫秒时间戳
          if (/^\d+$/.test(trimmed)) {
            atMs = parseInt(trimmed, 10);
          } else {
            const parsed = Date.parse(trimmed);
            if (isNaN(parsed)) {
              return {
                success: false,
                error: `无法解析时间字符串: "${at_timestamp}"。支持格式：毫秒时间戳、"YYYY-MM-DD HH:mm:ss"、"HH:mm"、"YYYY-MM-DDTHH:mm:ss"`,
              };
            }
            atMs = parsed;
          }
        }
      }

      // Determine schedule type
      let schedule: CronSchedule;

      if (atMs) {
        schedule = { kind: 'at', at_ms: atMs };
      } else if (every_seconds) {
        schedule = { kind: 'every', every_ms: every_seconds * 1000 };
      } else if (cron_expr) {
        schedule = { kind: 'cron', expr: cron_expr };
      } else {
        return {
          success: false,
          error: 'Either every_seconds, cron_expr, or at_timestamp is required',
        };
      }

      try {
        const job = await cronService.addJob(name, schedule, message, {
          target: jobTarget,
          agentType: jobTarget === 'agent' ? agentType : undefined,
        });
        return {
          success: true,
          job: {
            id: job.id,
            name: job.name,
            target: job.payload.target,
            schedule: job.schedule,
            next_run: job.state.next_run_at_ms,
            next_run_formatted: job.state.next_run_at_ms
              ? new Date(job.state.next_run_at_ms).toLocaleString('zh-CN')
              : null,
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
