import React from 'react';
import { CheckCircle2, Circle, Plus, Trash2 } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';

const TaskList: React.FC = () => {
  const { tasks, addTask, toggleTask, removeTask } = useChatStore();
  const [newTaskInput, setNewTaskInput] = React.useState('');

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskInput.trim()) {
      addTask(newTaskInput.trim());
      setNewTaskInput('');
    }
  };

  return (
    <div className="w-80 bg-white/50 backdrop-blur-xl border-r border-white/20 flex flex-col h-full">
      <div className="p-6 border-b border-white/20">
        <h2 className="text-lg font-semibold text-gray-800 mb-1">任务列表</h2>
        <p className="text-sm text-gray-500">管理和追踪您的任务</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {tasks.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            <Circle size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无任务</p>
            <p className="text-xs mt-1">添加新任务开始使用</p>
          </div>
        ) : (
          tasks.map((task: any) => (
            <div
              key={task.id}
              className="group relative p-4 bg-white/60 rounded-xl border border-white/30 hover:shadow-md transition-all duration-300"
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`flex-shrink-0 mt-0.5 ${
                    task.completed ? 'text-green-500' : 'text-gray-300 hover:text-primary-blue'
                  } transition-colors`}
                >
                  {task.completed ? (
                    <CheckCircle2 size={20} />
                  ) : (
                    <Circle size={20} />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p
                    className={`text-sm ${
                      task.completed
                        ? 'text-gray-400 line-through'
                        : 'text-gray-700'
                    } break-words`}
                  >
                    {task.content}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {new Date(task.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => removeTask(task.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg transition-all text-red-400 hover:text-red-500"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleAddTask} className="p-4 border-t border-white/20">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTaskInput}
            onChange={(e) => setNewTaskInput(e.target.value)}
            placeholder="添加新任务..."
            className="flex-1 px-4 py-3 bg-white/70 border border-white/30 rounded-xl text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-transparent transition-all"
          />
          <button
            type="submit"
            disabled={!newTaskInput.trim()}
            className="px-4 py-3 bg-primary-blue text-white rounded-xl hover:bg-primary-blue/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center"
          >
            <Plus size={20} />
          </button>
        </div>
      </form>
    </div>
  );
};

export default TaskList;
