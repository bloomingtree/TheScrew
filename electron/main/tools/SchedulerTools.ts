/**
 * Scheduler Tools - 定时任务工具（2026-09-09 收敛：10 → 2）
 *
 * cron（add/list/remove/enable/run/status/clear）+ heartbeat（status/get_tasks/trigger）
 * operation enum 分发，用法速查写在 description（Claude Code 风格）。
 *
 * Based on nanobot architecture:
 * - https://github.com/nanobot-xyz/nanobot
 */

import { getCronService } from '../scheduler';
import { CronSchedule } from '../scheduler/types';
import { Tool } from './ToolManager';

// ============================================================================
// Cron Tool（单工具）
// ============================================================================

const cronTool: Tool = {
  name: 'cron',
  description: `定时任务管理。operation 取值：

- **add**：创建任务。必需 name + message；target="user"（默认，弹通知提醒用户）或 "agent"（后台自主执行，如每日总结）；时间三选一：cron_expr（"分 时 日 月 周"，如"0 9 * * *"=每天9点，优先用）/ every_seconds（周期秒数）/ at_timestamp（一次性：时间戳或"2026-06-14 10:05"/"10:30"字符串）；target=agent 可选 agentType（default/office/devops/secretary）
- **list**：列出任务（include_disabled=true 含禁用的）
- **remove**：按 job_id 删除
- **enable**：启用/禁用（job_id + enabled）
- **run**：手动立即执行（force=true 可执行禁用任务）
- **status**：服务状态（任务数、下次唤醒时间）
- **clear**：清空全部任务（慎用）

示例：
- cron({operation:"add", name:"日报提醒", message:"去写日报", cron_expr:"0 18 * * *"})
- cron({operation:"add", name:"每日总结", message:"总结今天所有对话并写daily笔记", target:"agent", cron_expr:"30 21 * * *"})
- cron({operation:"list"})`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['add', 'list', 'remove', 'enable', 'run', 'status', 'clear'],
        description: '操作类型，见上方速查表',
      },
      name: {
        type: 'string',
        description: '（add）任务名称（简短，如"汇报提醒"、"每日工作总结"）',
      },
      message: {
        type: 'string',
        description: '（add）任务内容。target=user 时是提醒文本；target=agent 时是 agent 要执行的 prompt',
      },
      target: {
        type: 'string',
        enum: ['user', 'agent'],
        description: '（add）任务目标：user=提醒用户（默认）；agent=agent 自主执行',
      },
      every_seconds: {
        type: 'number',
        description: '（add）周期任务的间隔秒数（如 3600=每小时、86400=每天）',
      },
      cron_expr: {
        type: 'string',
        description: '（add）cron 表达式，格式"分 时 日 月 周"，如"0 9 * * *"=每天9点。AI 设定时间时优先用此参数',
      },
      at_timestamp: {
        type: ['number', 'string'],
        description: '（add）一次性任务的时间。支持：毫秒时间戳(number)、日期时间字符串(string，如"2026-06-14 10:05:00"、"10:30")',
      },
      agentType: {
        type: 'string',
        enum: ['default', 'office', 'devops', 'secretary'],
        description: '（add，target=agent）agent 类型，默认 default',
      },
      job_id: {
        type: 'string',
        description: '（remove/enable/run）任务 ID',
      },
      enabled: {
        type: 'boolean',
        description: '（enable）true 启用 / false 禁用',
      },
      force: {
        type: 'boolean',
        description: '（run）即使任务被禁用也执行',
      },
      include_disabled: {
        type: 'boolean',
        description: '（list）是否包含禁用的任务',
      },
    },
    required: ['operation'],
  },
  handler: async (args: any) => {
    const { operation } = args;
    const cronService = getCronService();

    try {
      switch (operation) {
        case 'add': {
          const { name, message, target, every_seconds, cron_expr, at_timestamp, agentType } = args;

          if (!name || !message) {
            return { success: false, error: 'add 操作需要 name 和 message 参数' };
          }

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
              error: '时间参数三选一：cron_expr / every_seconds / at_timestamp',
            };
          }

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
        }

        case 'list': {
          const jobs = await cronService.listJobs(args.include_disabled || false);

          if (jobs.length === 0) {
            return { success: true, message: '当前没有定时任务', jobs: [] };
          }

          return {
            success: true,
            message: `共 ${jobs.length} 个定时任务`,
            jobs: jobs.map(job => ({
              id: job.id,
              name: job.name,
              enabled: job.enabled,
              schedule: job.schedule,
              next_run: job.state.next_run_at_ms,
              last_run: job.state.last_run_at_ms,
              last_status: job.state.last_status,
            })),
          };
        }

        case 'remove': {
          const { job_id } = args;
          if (!job_id) return { success: false, error: 'remove 操作需要 job_id 参数' };

          const removed = await cronService.removeJob(job_id);
          if (!removed) return { success: false, error: `未找到任务 ${job_id}` };
          return { success: true, message: `任务 ${job_id} 已删除` };
        }

        case 'enable': {
          const { job_id, enabled } = args;
          if (!job_id || typeof enabled !== 'boolean') {
            return { success: false, error: 'enable 操作需要 job_id 和 enabled 参数' };
          }

          const job = await cronService.enableJob(job_id, enabled);
          if (!job) return { success: false, error: `未找到任务 ${job_id}` };

          return {
            success: true,
            message: `任务 ${job_id} 已${enabled ? '启用' : '禁用'}`,
            job: {
              id: job.id,
              name: job.name,
              enabled: job.enabled,
              next_run: job.state.next_run_at_ms,
            },
          };
        }

        case 'run': {
          const { job_id, force = false } = args;
          if (!job_id) return { success: false, error: 'run 操作需要 job_id 参数' };

          const ran = await cronService.runJob(job_id, force);
          if (!ran) {
            return {
              success: false,
              error: `任务 ${job_id} 不存在或已被禁用（force=true 可执行禁用任务）`,
            };
          }
          return { success: true, message: `任务 ${job_id} 已触发执行` };
        }

        case 'status': {
          const status = await cronService.status();
          return {
            success: true,
            status: {
              enabled: status.enabled,
              jobs: status.jobs,
              next_wake: status.next_wake_at_ms,
              next_wake_formatted: status.next_wake_at_ms
                ? new Date(status.next_wake_at_ms).toLocaleString('zh-CN')
                : '无定时任务',
            },
          };
        }

        case 'clear': {
          await cronService.clearAll();
          return { success: true, message: '所有定时任务已清空' };
        }

        default:
          return {
            success: false,
            error: `未知 operation "${operation}"。可用：add / list / remove / enable / run / status / clear`,
          };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ============================================================================
// Heartbeat Tool（单工具）
// ============================================================================

const heartbeatTool: Tool = {
  name: 'heartbeat',
  description: `心跳服务（基于工作区 HEARTBEAT.md 的周期自检任务）。operation 取值：

- **status**：服务状态（运行间隔、活跃任务数）
- **get_tasks**：列出 HEARTBEAT.md 中的任务（active_only=true 只看未完成的）
- **trigger**：手动触发一次心跳检查`,
  parameters: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['status', 'get_tasks', 'trigger'],
        description: '操作类型，见上方速查表',
      },
      active_only: {
        type: 'boolean',
        description: '（get_tasks）只返回未完成任务',
      },
    },
    required: ['operation'],
  },
  handler: async (args: any) => {
    const { operation } = args;
    const { getHeartbeatService } = await import('../scheduler');
    const heartbeatService = getHeartbeatService();

    if (!heartbeatService) {
      return { success: false, error: '心跳服务未初始化' };
    }

    try {
      switch (operation) {
        case 'status': {
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
        }

        case 'get_tasks': {
          const tasks = await heartbeatService.getTasks();
          const filtered = args.active_only ? tasks.filter(t => !t.completed) : tasks;
          return { success: true, tasks: filtered, count: filtered.length };
        }

        case 'trigger': {
          const result = await heartbeatService.triggerNow();
          return {
            success: true,
            result,
            message: result
              ? result.includes('HEARTBEAT_OK')
                ? '心跳完成：无事可做'
                : '心跳完成：任务已执行'
              : '心跳完成',
          };
        }

        default:
          return { success: false, error: `未知 operation "${operation}"。可用：status / get_tasks / trigger` };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

// ============================================================================
// 导出
// ============================================================================

export const cronTools: Tool[] = [cronTool];
export const heartbeatTools: Tool[] = [heartbeatTool];
