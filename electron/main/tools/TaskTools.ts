/**
 * TaskTools - 任务管理工具
 * 为 AI 助手提供秘书/管家角色能力，管理用户的待办任务
 *
 * 存储：应用根目录 .config/data/tasks.json（PathManager 管理，不依赖工作空间）
 * 零外部依赖，纯 Node.js 实现
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { Tool } from './ToolManager';
import { getPathManager } from '../config/PathManager';

// ==================== 类型定义 ====================

interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  humanId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
  tags: string[];
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  notes: string[];
  subtasks: SubTask[];
}

export interface TaskStore {
  tasks: Task[];
  nextId: number;
}

// ==================== 常量 ====================

const TASKS_FILE = 'tasks.json';
const PRIORITY_WEIGHT: Record<string, number> = { high: 3, medium: 2, low: 1 };
const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled', 'all'] as const;
const VALID_PRIORITIES = ['high', 'medium', 'low'] as const;
const VALID_SORT_FIELDS = ['createdAt', 'priority', 'dueDate'] as const;
const VALID_SORT_ORDERS = ['asc', 'desc'] as const;

// ==================== 工具空间路径 ====================

// 使用 globalThis + Symbol.for 获取工作空间路径（跨 chunk 共享）
// 仅用于一次性迁移旧数据，日常存储不再依赖工作空间
const _workspaceKey = Symbol.for('zero-employee:getWorkspacePath()');

function getWorkspacePath(): string | null {
  return (globalThis as any)[_workspaceKey] ?? null;
}

// ==================== 存储操作 ====================

/**
 * 获取任务数据文件路径（应用根目录 .config/data/，由 PathManager 统一管理）
 */
function getTasksFilePath(): string {
  return path.join(getPathManager().getDataPath(), TASKS_FILE);
}

/**
 * 旧版存储位置（workspacePath/.config/data/tasks.json）迁移
 * 新文件不存在而旧文件存在时，将旧数据复制过来（仅执行一次）
 */
function migrateLegacyStoreIfNeeded(newFilePath: string): void {
  if (fs.existsSync(newFilePath)) return;
  const workspaceRoot = getWorkspacePath();
  if (!workspaceRoot) return;
  const legacyPath = path.join(workspaceRoot, '.config', 'data', TASKS_FILE);
  try {
    if (fs.existsSync(legacyPath)) {
      fs.copyFileSync(legacyPath, newFilePath);
    }
  } catch {
    // 迁移失败忽略，使用空存储
  }
}

/**
 * 加载任务存储（文件不存在时创建空存储）
 */
function loadStore(): TaskStore {
  const filePath = getTasksFilePath();
  migrateLegacyStoreIfNeeded(filePath);
  if (!fs.existsSync(filePath)) {
    const empty: TaskStore = { tasks: [], nextId: 1 };
    saveStore(empty);
    return empty;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as TaskStore;
}

/**
 * 公共 helper：供 IPC 层（electron/main/ipc/tasks.ts）复用，读取任务列表快照
 * 读取失败时返回空数组（不抛错）。
 */
export function listAllTasksForIPC(): Task[] {
  try {
    return loadStore().tasks;
  } catch {
    return [];
  }
}

/**
 * 公共 helper：供 IPC 层直接修改任务状态（供前端 UI 调用，不走 AI 工具协议）
 * 成功返回更新后的 task，失败抛错。
 */
export function updateTaskStatusForIPC(
  id: string,
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
): Task {
  if (!id || typeof id !== 'string') {
    throw new Error('必须提供任务 ID');
  }
  if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
    throw new Error(`无效的状态 "${status}"`);
  }
  const store = loadStore();
  const task = findTask(store, id);
  if (!task) {
    throw new Error(`未找到任务 "${id}"`);
  }
  const oldStatus = task.status;
  task.status = status;
  if (status === 'completed' && oldStatus !== 'completed') {
    task.completedAt = nowISO();
  }
  if (oldStatus === 'completed' && status !== 'completed') {
    task.completedAt = null;
  }
  task.updatedAt = nowISO();
  saveStore(store);
  return task;
}

/**
 * 原子写入任务存储（写临时文件后重命名）
 */
function saveStore(store: TaskStore): void {
  const filePath = getTasksFilePath();
  const tmpPath = filePath + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(store, null, 2), 'utf-8');
  fs.renameSync(tmpPath, filePath);
}

/**
 * 生成人类可读的任务 ID（T-001 格式）
 */
function generateHumanId(nextId: number): string {
  return `T-${String(nextId).padStart(3, '0')}`;
}

/**
 * 查找任务（支持 UUID 或 T-XXX 格式，不区分大小写）
 */
function findTask(store: TaskStore, id: string): Task | undefined {
  const normalized = id.trim().toUpperCase();
  return store.tasks.find(t => t.id === id || t.humanId.toUpperCase() === normalized);
}

/**
 * 验证日期格式 YYYY-MM-DD
 */
function isValidDate(dateStr: string): boolean {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(dateStr);
  if (!match) return false;
  const date = new Date(dateStr + 'T00:00:00.000Z');
  return !isNaN(date.getTime());
}

/**
 * 将 YYYY-MM-DD 转换为 ISO datetime（当天 23:59:59 UTC）
 */
function toISODate(dateStr: string): string {
  return `${dateStr}T23:59:59.999Z`;
}

/**
 * 当前时间的 ISO 字符串
 */
function nowISO(): string {
  return new Date().toISOString();
}

// ==================== 工具定义 ====================

/**
 * task_create - 创建新任务
 */
const taskCreateTool: Tool = {
  name: 'task_create',
  description: `创建一个新的待办任务。

**必需参数**：
- title: 任务标题

**可选参数**：
- description: 详细描述（默认为空）
- priority: 优先级 "high" | "medium" | "low"（默认 "medium"）
- tags: 标签数组，用于分类
- dueDate: 截止日期，格式 YYYY-MM-DD
- subtasks: 子任务标题列表

创建成功后会返回完整的任务信息，包含自动生成的 ID（UUID）和人类可读 ID（T-XXX 格式）。`,
  parameters: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: '任务标题（简短描述任务内容）',
      },
      description: {
        type: 'string',
        description: '任务的详细描述',
        default: '',
      },
      priority: {
        type: 'string',
        description: '优先级：high（高）、medium（中）、low（低）',
        enum: ['high', 'medium', 'low'],
        default: 'medium',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '标签列表，用于分类和筛选',
        default: [],
      },
      dueDate: {
        type: 'string',
        description: '截止日期，格式 YYYY-MM-DD',
      },
      subtasks: {
        type: 'array',
        items: { type: 'string' },
        description: '子任务标题列表',
      },
    },
    required: ['title'],
  },
  handler: async (args: any) => {
    try {
      const { title, description = '', priority = 'medium', tags = [], dueDate, subtasks } = args;

      if (!title || typeof title !== 'string' || title.trim().length === 0) {
        return { success: false, error: '任务标题不能为空' };
      }

      if (!VALID_PRIORITIES.includes(priority)) {
        return { success: false, error: `无效的优先级 "${priority}"，可选值：high、medium、low` };
      }

      if (dueDate && !isValidDate(dueDate)) {
        return { success: false, error: `无效的日期格式 "${dueDate}"，请使用 YYYY-MM-DD 格式` };
      }

      const store = loadStore();
      const now = nowISO();

      const task: Task = {
        id: crypto.randomUUID(),
        humanId: generateHumanId(store.nextId),
        title: title.trim(),
        description: description || '',
        status: 'pending',
        priority: priority as 'high' | 'medium' | 'low',
        tags: Array.isArray(tags) ? tags.filter((t: any) => typeof t === 'string') : [],
        dueDate: dueDate ? toISODate(dueDate) : null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
        notes: [],
        subtasks: Array.isArray(subtasks)
          ? subtasks
              .filter((s: any) => typeof s === 'string' && s.trim().length > 0)
              .map((s: string) => ({
                id: crypto.randomUUID(),
                title: s.trim(),
                completed: false,
              }))
          : [],
      };

      store.tasks.push(task);
      store.nextId++;
      saveStore(store);

      return {
        success: true,
        message: `任务已创建: ${task.humanId} - ${task.title}`,
        task: formatTaskFull(task),
      };
    } catch (error: any) {
      return { success: false, error: error.message || '创建任务失败' };
    }
  },
};

/**
 * task_list - 列出任务（支持筛选和排序）
 */
const taskListTool: Tool = {
  name: 'task_list',
  description: `列出任务，支持按状态、优先级、标签筛选和排序。

**可选参数**：
- status: 筛选状态 "pending" | "in_progress" | "completed" | "cancelled" | "all"（默认 "pending"）
- priority: 按优先级筛选
- tag: 按标签筛选
- sortBy: 排序字段 "createdAt" | "priority" | "dueDate"（默认 "createdAt"）
- sortOrder: 排序方向 "asc" | "desc"（默认 "desc"）
- limit: 最多返回任务数（默认 20）

返回任务摘要列表（不包含完整描述和备注），便于快速浏览。`,
  parameters: {
    type: 'object',
    properties: {
      status: {
        type: 'string',
        description: '筛选状态：pending（待处理）、in_progress（进行中）、completed（已完成）、cancelled（已取消）、all（全部）',
        enum: ['pending', 'in_progress', 'completed', 'cancelled', 'all'],
        default: 'pending',
      },
      priority: {
        type: 'string',
        description: '按优先级筛选：high、medium、low',
        enum: ['high', 'medium', 'low'],
      },
      tag: {
        type: 'string',
        description: '按标签筛选',
      },
      sortBy: {
        type: 'string',
        description: '排序字段：createdAt（创建时间）、priority（优先级）、dueDate（截止日期）',
        enum: ['createdAt', 'priority', 'dueDate'],
        default: 'createdAt',
      },
      sortOrder: {
        type: 'string',
        description: '排序方向：asc（升序）、desc（降序）',
        enum: ['asc', 'desc'],
        default: 'desc',
      },
      limit: {
        type: 'number',
        description: '最多返回的任务数量（默认 20）',
        default: 20,
      },
    },
  },
  handler: async (args: any) => {
    try {
      const {
        status = 'pending',
        priority,
        tag,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        limit = 20,
      } = args;

      const store = loadStore();
      let filtered = [...store.tasks];

      // 按状态筛选
      if (status !== 'all') {
        if (!VALID_STATUSES.includes(status as any) || status === 'all') {
          return { success: false, error: `无效的状态 "${status}"` };
        }
        filtered = filtered.filter(t => t.status === status);
      }

      // 按优先级筛选
      if (priority) {
        if (!VALID_PRIORITIES.includes(priority as any)) {
          return { success: false, error: `无效的优先级 "${priority}"` };
        }
        filtered = filtered.filter(t => t.priority === priority);
      }

      // 按标签筛选
      if (tag) {
        filtered = filtered.filter(t => t.tags.includes(tag));
      }

      // 排序
      const sortField = VALID_SORT_FIELDS.includes(sortBy as any) ? sortBy : 'createdAt';
      const order = VALID_SORT_ORDERS.includes(sortOrder as any) ? sortOrder : 'desc';
      const multiplier = order === 'asc' ? 1 : -1;

      filtered.sort((a, b) => {
        let cmp = 0;
        switch (sortField) {
          case 'priority':
            cmp = (PRIORITY_WEIGHT[b.priority] || 0) - (PRIORITY_WEIGHT[a.priority] || 0);
            break;
          case 'dueDate':
            // 没有 dueDate 的排在后面
            if (!a.dueDate && !b.dueDate) cmp = 0;
            else if (!a.dueDate) cmp = 1;
            else if (!b.dueDate) cmp = -1;
            else cmp = new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            break;
          case 'createdAt':
          default:
            cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            break;
        }
        return cmp * multiplier;
      });

      // 限制数量
      const maxLimit = Math.max(1, Math.min(100, Math.floor(limit)));
      const total = filtered.length;
      const truncated = total > maxLimit;
      const results = filtered.slice(0, maxLimit);

      return {
        success: true,
        tasks: results.map(formatTaskSummary),
        total: store.tasks.length,
        filtered: filtered.length,
        ...(truncated ? { hint: `共 ${total} 个匹配任务，仅显示前 ${maxLimit} 个` } : {}),
      };
    } catch (error: any) {
      return { success: false, error: error.message || '获取任务列表失败' };
    }
  },
};

/**
 * task_update - 更新任务
 */
const taskUpdateTool: Tool = {
  name: 'task_update',
  description: `更新现有任务的信息。

**必需参数**：
- id: 任务 ID（UUID 或人类可读 ID，如 T-001）

**可选参数**（仅更新提供的字段）：
- title: 新标题
- description: 新描述
- status: 新状态 "pending" | "in_progress" | "completed" | "cancelled"
- priority: 新优先级 "high" | "medium" | "low"
- dueDate: 新截止日期（YYYY-MM-DD 格式）
- tags: 新标签列表（替换现有标签）
- note: 添加备注（追加到现有备注，不影响其他字段）
- toggleSubtask: 子任务 ID，切换其完成状态`,
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '任务 ID（UUID 或人类可读 ID，如 T-001、t-001）',
      },
      title: {
        type: 'string',
        description: '新标题',
      },
      description: {
        type: 'string',
        description: '新描述',
      },
      status: {
        type: 'string',
        description: '新状态：pending、in_progress、completed、cancelled',
        enum: ['pending', 'in_progress', 'completed', 'cancelled'],
      },
      priority: {
        type: 'string',
        description: '新优先级：high、medium、low',
        enum: ['high', 'medium', 'low'],
      },
      dueDate: {
        type: 'string',
        description: '新截止日期（YYYY-MM-DD 格式），传空字符串清除截止日期',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: '新标签列表（替换现有标签）',
      },
      note: {
        type: 'string',
        description: '追加的备注内容',
      },
      toggleSubtask: {
        type: 'string',
        description: '要切换完成状态的子任务 ID',
      },
    },
    required: ['id'],
  },
  handler: async (args: any) => {
    try {
      const { id, title, description, status, priority, dueDate, tags, note, toggleSubtask } = args;

      if (!id || typeof id !== 'string') {
        return { success: false, error: '必须提供任务 ID' };
      }

      // 验证参数
      if (status && !['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
        return { success: false, error: `无效的状态 "${status}"` };
      }
      if (priority && !VALID_PRIORITIES.includes(priority as any)) {
        return { success: false, error: `无效的优先级 "${priority}"` };
      }
      if (dueDate && dueDate !== '' && !isValidDate(dueDate)) {
        return { success: false, error: `无效的日期格式 "${dueDate}"，请使用 YYYY-MM-DD 格式` };
      }

      const store = loadStore();
      const task = findTask(store, id);

      if (!task) {
        return { success: false, error: `未找到任务 "${id}"` };
      }

      // 更新字段
      if (title !== undefined) task.title = title.trim();
      if (description !== undefined) task.description = description;
      if (status !== undefined) {
        const oldStatus = task.status;
        task.status = status as Task['status'];
        // 状态变为 completed 时设置完成时间
        if (status === 'completed' && oldStatus !== 'completed') {
          task.completedAt = nowISO();
        }
        // 从 completed 改回其他状态时清除完成时间
        if (oldStatus === 'completed' && status !== 'completed') {
          task.completedAt = null;
        }
      }
      if (priority !== undefined) task.priority = priority as Task['priority'];
      if (dueDate !== undefined) {
        task.dueDate = dueDate === '' ? null : toISODate(dueDate);
      }
      if (tags !== undefined) {
        task.tags = Array.isArray(tags) ? tags.filter((t: any) => typeof t === 'string') : [];
      }

      // 添加备注
      if (note && typeof note === 'string' && note.trim().length > 0) {
        task.notes.push(`[${nowISO()}] ${note.trim()}`);
      }

      // 切换子任务完成状态
      if (toggleSubtask && typeof toggleSubtask === 'string') {
        const subtask = task.subtasks.find(st => st.id === toggleSubtask);
        if (subtask) {
          subtask.completed = !subtask.completed;
        } else {
          return { success: false, error: `未找到子任务 "${toggleSubtask}"` };
        }
      }

      task.updatedAt = nowISO();
      saveStore(store);

      return {
        success: true,
        message: `任务已更新: ${task.humanId} - ${task.title}`,
        task: formatTaskFull(task),
      };
    } catch (error: any) {
      return { success: false, error: error.message || '更新任务失败' };
    }
  },
};

/**
 * task_complete - 标记任务为已完成
 */
const taskCompleteTool: Tool = {
  name: 'task_complete',
  description: `将任务标记为已完成。

**必需参数**：
- id: 任务 ID（UUID 或人类可读 ID，如 T-001）

**可选参数**：
- completionNote: 完成备注

此操作会将任务状态设为 completed 并记录完成时间。如果任务已有子任务，会同时将所有未完成的子任务标记为完成。`,
  parameters: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: '任务 ID（UUID 或人类可读 ID，如 T-001、t-001）',
      },
      completionNote: {
        type: 'string',
        description: '完成备注（可选）',
      },
    },
    required: ['id'],
  },
  handler: async (args: any) => {
    try {
      const { id, completionNote } = args;

      if (!id || typeof id !== 'string') {
        return { success: false, error: '必须提供任务 ID' };
      }

      const store = loadStore();
      const task = findTask(store, id);

      if (!task) {
        return { success: false, error: `未找到任务 "${id}"` };
      }

      if (task.status === 'completed') {
        return {
          success: false,
          error: `任务 ${task.humanId} 已经是完成状态`,
          task: formatTaskSummary(task),
        };
      }

      const now = nowISO();
      task.status = 'completed';
      task.completedAt = now;
      task.updatedAt = now;

      // 将所有未完成的子任务标记为完成
      let completedSubtasks = 0;
      for (const subtask of task.subtasks) {
        if (!subtask.completed) {
          subtask.completed = true;
          completedSubtasks++;
        }
      }

      // 添加完成备注
      if (completionNote && typeof completionNote === 'string' && completionNote.trim().length > 0) {
        task.notes.push(`[${now}] 已完成: ${completionNote.trim()}`);
      } else {
        task.notes.push(`[${now}] 已完成`);
      }

      saveStore(store);

      const summary = formatTaskSummary(task);
      return {
        success: true,
        message: `任务已完成: ${task.humanId} - ${task.title}`,
        task: summary,
        ...(completedSubtasks > 0
          ? { info: `同时完成了 ${completedSubtasks} 个未完成的子任务` }
          : {}),
      };
    } catch (error: any) {
      return { success: false, error: error.message || '完成任务失败' };
    }
  },
};

// ==================== 格式化辅助 ====================

/**
 * 任务摘要格式（用于列表展示）
 */
function formatTaskSummary(task: Task) {
  const totalSubtasks = task.subtasks.length;
  const completedSubtasks = task.subtasks.filter(st => st.completed).length;

  return {
    id: task.id,
    humanId: task.humanId,
    title: task.title,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    ...(totalSubtasks > 0
      ? { subtaskProgress: `${completedSubtasks}/${totalSubtasks}` }
      : {}),
  };
}

/**
 * 任务完整格式（用于详情展示）
 */
function formatTaskFull(task: Task) {
  return {
    id: task.id,
    humanId: task.humanId,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    tags: task.tags,
    dueDate: task.dueDate,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    completedAt: task.completedAt,
    notes: task.notes,
    subtasks: task.subtasks.map(st => ({
      id: st.id,
      title: st.title,
      completed: st.completed,
    })),
  };
}

// ==================== 导出 ====================

export const taskTools: Tool[] = [
  taskCreateTool,
  taskListTool,
  taskUpdateTool,
  taskCompleteTool,
];
