import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { History, CheckCircle, XCircle, Clock } from 'lucide-react';
import { useChatStore } from '../../../store/chatStore';

const HistoryTab: React.FC = () => {
  const { toolExecutions } = useChatStore();

  // 将 Map 转换为数组并排序
  const executions = useMemo(() => {
    return Array.from(toolExecutions.values()).sort((a, b) => b.startTime - a.startTime);
  }, [toolExecutions]);

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 格式化持续时间
  const formatDuration = (ms?: number) => {
    if (!ms) return '-';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (executions.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <History size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">暂无工具执行记录</p>
          <p className="text-xs mt-1">大模型执行工具时会在此显示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <span className="text-sm text-gray-600">工具执行历史</span>
        <span className="text-xs text-gray-400">{executions.length} 条记录</span>
      </div>

      {/* 历史记录列表 */}
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {executions.map((execution, index) => (
          <motion.div
            key={execution.toolCallId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start gap-3">
              {/* 状态图标 */}
              <div className="flex-shrink-0 mt-0.5">
                {execution.success === undefined ? (
                  <Clock size={16} className="text-yellow-500" />
                ) : execution.success ? (
                  <CheckCircle size={16} className="text-green-500" />
                ) : (
                  <XCircle size={16} className="text-red-500" />
                )}
              </div>

              {/* 内容 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm text-gray-800">{execution.name}</span>
                  <span className="text-xs text-gray-400">{formatTime(execution.startTime)}</span>
                </div>

                {execution.description && (
                  <p className="text-xs text-gray-600 mb-2">{execution.description}</p>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span>耗时: {formatDuration(execution.duration)}</span>
                  {execution.endTime && (
                    <span>完成于: {formatTime(execution.endTime)}</span>
                  )}
                </div>

                {/* 参数预览 */}
                {execution.arguments && (
                  <details className="mt-2">
                    <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
                      查看参数
                    </summary>
                    <pre className="mt-1 p-2 bg-gray-50 rounded text-xs text-gray-600 overflow-x-auto">
                      {typeof execution.arguments === 'string'
                        ? execution.arguments
                        : JSON.stringify(execution.arguments, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default HistoryTab;
