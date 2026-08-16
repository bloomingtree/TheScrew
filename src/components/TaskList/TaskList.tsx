import React, { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, Circle, Trash2, RefreshCw, AlertCircle, Flag } from 'lucide-react';

interface Task {
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
  subtasks: Array<{ id: string; title: string; completed: boolean }>;
}

interface TaskListProps {
  /** 紧凑模式（嵌入到侧边/分屏面板）；默认 false（独立面板） */
  compact?: boolean;
}

const priorityColor: Record<string, string> = {
  high: '#dc2626',
  medium: '#d97706',
  low: '#6b7280',
};
const priorityLabel: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};
const statusLabel: Record<string, string> = {
  pending: '待办',
  in_progress: '进行中',
  completed: '已完成',
  cancelled: '已取消',
};

const TaskList: React.FC<TaskListProps> = ({ compact = false }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.listTasks();
      if (res?.success) {
        // 排序：未完成在前 → 优先级降序 → 创建时间升序
        const sorted = [...res.tasks].sort((a, b) => {
          const aDone = a.status === 'completed' || a.status === 'cancelled';
          const bDone = b.status === 'completed' || b.status === 'cancelled';
          if (aDone !== bDone) return aDone ? 1 : -1;
          const pw: Record<string, number> = { high: 3, medium: 2, low: 1 };
          if (pw[b.priority] !== pw[a.priority]) return pw[b.priority] - pw[a.priority];
          return a.createdAt.localeCompare(b.createdAt);
        });
        setTasks(sorted);
      } else {
        setError(res?.error || '加载失败');
      }
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = window.electronAPI.onTasksChanged(() => refresh());
    return unsub;
  }, [refresh]);

  const pending = tasks.filter(t => t.status !== 'completed' && t.status !== 'cancelled');
  const done = tasks.filter(t => t.status === 'completed' || t.status === 'cancelled');

  return (
    <div className={`flex flex-col h-full ${compact ? '' : 'w-full bg-white/50 backdrop-blur-xl border-r border-white/20'}`}>
      <div className={`flex items-center justify-between ${compact ? 'px-3 py-2' : 'p-6 border-b border-white/20'}`}>
        <div>
          <h2 className={`font-semibold text-gray-800 ${compact ? 'text-sm' : 'text-lg mb-1'}`}>
            任务列表
            <span className="ml-2 text-xs font-normal text-gray-500">{pending.length} 项待办</span>
          </h2>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          title="刷新"
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">加载失败</p>
              <p className="mt-0.5 opacity-80">{error}</p>
              <p className="mt-1 opacity-60">任务存储于应用本地 .config/data/tasks.json</p>
            </div>
          </div>
        )}

        {!error && tasks.length === 0 && !loading && (
          <div className="text-center py-8 text-gray-400">
            <Circle size={compact ? 32 : 48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无任务</p>
            <p className="text-xs mt-1">让 AI 创建任务（task_create）</p>
          </div>
        )}

        {pending.map(task => (
          <TaskCard key={task.id} task={task} compact={compact} />
        ))}

        {done.length > 0 && (
          <>
            <div className="pt-2 pb-1 text-xs text-gray-400 select-none">
              已完成 / 已取消（{done.length}）
            </div>
            {done.map(task => (
              <TaskCard key={task.id} task={task} compact={compact} faded />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

const TaskCard: React.FC<{ task: Task; compact?: boolean; faded?: boolean }> = ({ task, compact = false, faded = false }) => {
  const isCompleted = task.status === 'completed';
  const isCancelled = task.status === 'cancelled';
  const inProgress = task.status === 'in_progress';
  const [toggling, setToggling] = useState(false);

  const toggleStatus = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (toggling || isCancelled) return;
    const nextStatus = isCompleted ? 'pending' : 'completed';
    setToggling(true);
    try {
      await window.electronAPI.updateTaskStatus(task.id, nextStatus);
      // onTasksChanged 监听会自动刷新列表
    } catch (err) {
      console.error('更新任务状态失败:', err);
    } finally {
      setToggling(false);
    }
  };

  return (
    <div
      className={`group relative p-3 bg-white/60 rounded-xl border border-white/30 hover:shadow-sm transition-all duration-200 ${faded ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start gap-2.5">
        <button
          onClick={toggleStatus}
          disabled={isCancelled || toggling}
          title={
            isCancelled
              ? '已取消，不可切换'
              : isCompleted
              ? '点击标记为待办'
              : '点击标记为完成'
          }
          className="flex-shrink-0 mt-0.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 transition-transform hover:scale-110"
        >
          {isCompleted ? (
            <CheckCircle2 size={compact ? 16 : 18} className="text-green-500" />
          ) : isCancelled ? (
            <AlertCircle size={compact ? 16 : 18} className="text-gray-400" />
          ) : (
            <Circle
              size={compact ? 16 : 18}
              className={`${inProgress ? 'text-amber-500' : 'text-gray-300 hover:text-green-400'} ${toggling ? 'animate-pulse' : ''}`}
            />
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs font-mono text-gray-500">{task.humanId}</span>
            <span
              className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{
                color: priorityColor[task.priority],
                backgroundColor: `${priorityColor[task.priority]}15`,
              }}
            >
              <Flag size={9} />
              {priorityLabel[task.priority]}
            </span>
            {inProgress && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                进行中
              </span>
            )}
          </div>
          <p
            className={`text-sm break-words ${
              isCompleted ? 'text-gray-400 line-through' : isCancelled ? 'text-gray-400 line-through' : 'text-gray-700'
            }`}
          >
            {task.title}
          </p>
          {task.description && !compact && (
            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
          )}
          {task.subtasks && task.subtasks.length > 0 && (
            <div className="mt-1.5 text-xs text-gray-500">
              子任务：{task.subtasks.filter(s => s.completed).length}/{task.subtasks.length}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1 text-[10px] text-gray-400">
            <span>{statusLabel[task.status]}</span>
            {task.dueDate && <span>· 截止 {task.dueDate}</span>}
            <span>· 创建于 {task.createdAt.substring(0, 10)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskList;
