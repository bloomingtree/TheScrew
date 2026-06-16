/**
 * 定时任务状态管理
 */

import { create } from 'zustand';

// 任务执行记录
export interface JobExecution {
  id: string;
  jobId: string;
  jobName: string;
  startTime: number;
  endTime: number;
  status: 'success' | 'error' | 'timeout';
  result?: string;
  error?: string;
}

// 任务定义（扩展）
export interface SchedulerJob {
  id: string;
  name: string;
  enabled: boolean;
  schedule: {
    kind: 'cron' | 'every' | 'at';
    expr?: string;
    every_ms?: number;
    at_ms?: number;
  };
  payload: {
    // 兼容旧数据：可能存在 kind 字段；新数据使用 target
    kind?: string;
    target?: 'user' | 'agent';
    message: string;
    tools?: string[];
    agentType?: 'default' | 'office' | 'devops' | 'secretary';
  };
  icon?: string;
  description?: string;
  category?: string;
  notifyOnComplete?: boolean;
  maxRetries?: number;
  state: {
    next_run_at_ms?: number | null;
    last_run_at_ms?: number | null;
    last_status?: string | null;
    last_error?: string | null;
  };
  created_at_ms: number;
  updated_at_ms: number;
  delete_after_run?: boolean;
}

// 任务通知
export interface JobNotification {
  execution: JobExecution;
  timestamp: number;
  dismissed: boolean;
}

// 预置模板
export const PRESET_TEMPLATES = [
  // ===== Agent 自驱动型（target: 'agent'）=====
  {
    name: '每日工作总结',
    description: '总结今日所有对话，提取关键信息到工作记忆',
    schedule: { kind: 'cron' as const, expr: '0 23 * * *' },
    message: '总结今日所有对话内容。提取关键决策、用户偏好和待跟进事项，写入工作记忆。',
    target: 'agent' as const,
    icon: '📝',
    category: 'memory',
    notifyOnComplete: true,
  },
  {
    name: '工作空间清理',
    description: '清理超过30天的临时文件和过期会话空间',
    schedule: { kind: 'cron' as const, expr: '0 3 * * 0' },
    message: '清理工作空间中超过30天的临时文件和过期会话空间。列出已清理的文件。',
    target: 'agent' as const,
    icon: '🧹',
    category: 'maintenance',
    notifyOnComplete: false,
  },
  {
    name: '记忆提炼',
    description: '从近期工作记忆中提炼重要信息到长期记忆',
    schedule: { kind: 'cron' as const, expr: '0 10 * * 1' },
    message: '回顾最近7天的工作记忆，提炼重要的用户偏好、项目信息和决策到长期记忆中。',
    target: 'agent' as const,
    icon: '🧠',
    category: 'memory',
    notifyOnComplete: true,
  },
  // ===== 提醒用户型（target: 'user'）=====
  {
    name: '下班提醒',
    description: '每天下午 6 点提醒用户准备下班',
    schedule: { kind: 'cron' as const, expr: '0 18 * * *' },
    message: '该下班了！记得整理今天的工作内容。',
    target: 'user' as const,
    icon: '⏰',
    category: 'reminder',
    notifyOnComplete: false,
  },
  {
    name: '喝水提醒',
    description: '每隔 2 小时提醒喝水',
    schedule: { kind: 'every' as const, every_ms: 2 * 60 * 60 * 1000 },
    message: '该喝水了，记得多喝水保持健康！',
    target: 'user' as const,
    icon: '💧',
    category: 'reminder',
    notifyOnComplete: false,
  },
  {
    name: '周报提醒',
    description: '每周五下午 5 点提醒写周报',
    schedule: { kind: 'cron' as const, expr: '0 17 * * 5' },
    message: '该写本周周报了，回顾本周工作成果和下周计划。',
    target: 'user' as const,
    icon: '📋',
    category: 'reminder',
    notifyOnComplete: false,
  },
];

interface SchedulerState {
  jobs: SchedulerJob[];
  loading: boolean;
  createDialogOpen: boolean;
  editingJob: SchedulerJob | null;
  notification: JobNotification | null;

  setJobs: (jobs: SchedulerJob[]) => void;
  setLoading: (loading: boolean) => void;
  setCreateDialogOpen: (open: boolean) => void;
  setEditingJob: (job: SchedulerJob | null) => void;
  setNotification: (notification: JobNotification | null) => void;

  loadJobs: () => Promise<void>;
  createJob: (name: string, schedule: any, message: string, options?: any) => Promise<boolean>;
  deleteJob: (jobId: string) => Promise<boolean>;
  toggleJob: (jobId: string, enabled: boolean) => Promise<boolean>;
  runJob: (jobId: string) => Promise<boolean>;
}

export const useSchedulerStore = create<SchedulerState>((set, get) => ({
  jobs: [],
  loading: false,
  createDialogOpen: false,
  editingJob: null,
  notification: null,

  setJobs: (jobs) => set({ jobs }),
  setLoading: (loading) => set({ loading }),
  setCreateDialogOpen: (open) => set({ createDialogOpen: open }),
  setEditingJob: (job) => set({ editingJob: job }),
  setNotification: (notification) => set({ notification }),

  loadJobs: async () => {
    set({ loading: true });
    try {
      const result = await window.electronAPI.cron.list(true);
      if (result.success && Array.isArray(result.jobs)) {
        set({ jobs: result.jobs });
      }
    } catch (error) {
      console.error('[SchedulerStore] 加载任务失败:', error);
    } finally {
      set({ loading: false });
    }
  },

  createJob: async (name, schedule, message, options) => {
    try {
      const result = await window.electronAPI.cron.add({
        name,
        schedule,
        message,
        target: options?.target,
        tools: options?.tools,
        agentType: options?.agentType,
        delete_after_run: options?.deleteAfterRun,
      });
      if (result.success) {
        await get().loadJobs();
        return true;
      }
      return false;
    } catch (error) {
      console.error('[SchedulerStore] 创建任务失败:', error);
      return false;
    }
  },

  deleteJob: async (jobId) => {
    try {
      await window.electronAPI.cron.remove(jobId);
      await get().loadJobs();
      return true;
    } catch (error) {
      console.error('[SchedulerStore] 删除任务失败:', error);
      return false;
    }
  },

  toggleJob: async (jobId, enabled) => {
    try {
      await window.electronAPI.cron.enable(jobId, enabled);
      await get().loadJobs();
      return true;
    } catch (error) {
      console.error('[SchedulerStore] 切换任务状态失败:', error);
      return false;
    }
  },

  runJob: async (jobId) => {
    try {
      await window.electronAPI.cron.run(jobId, true);
      return true;
    } catch (error) {
      console.error('[SchedulerStore] 手动执行任务失败:', error);
      return false;
    }
  },
}));
