import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock } from 'lucide-react';
import { ToolCall, ToolResult } from '../../types';
import { getToolNameCN } from '../../types/thread';

interface ToolCallSimpleProps {
  toolCalls: ToolCall[];
  toolResults?: ToolResult[];
  status: 'running' | 'completed' | 'error';
}

const ToolCallSimple: React.FC<ToolCallSimpleProps> = ({
  toolCalls,
  toolResults = [],
  status,
}) => {
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());

  const toggleExpand = (toolCallId: string) => {
    setExpandedCalls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolCallId)) {
        newSet.delete(toolCallId);
      } else {
        newSet.add(toolCallId);
      }
      return newSet;
    });
  };

  const formatDuration = (startTime: number, endTime?: number) => {
    if (!endTime) return '';
    const duration = endTime - startTime;
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(2)}s`;
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-2"
    >
      {toolCalls.map((toolCall, index) => {
        const result = toolResults.find(r => r.toolCallId === toolCall.id);
        const isRunning = !result;
        const isSuccess = result?.success;
        const isError = result && !result.success;
        const isExpanded = expandedCalls.has(toolCall.id);

        return (
          <motion.div
            key={toolCall.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-all"
          >
            {/* 主信息行 - 始终可见 */}
            <div
              className={`flex items-center gap-3 p-3 ${(isSuccess || isError) ? 'cursor-pointer hover:bg-gray-50' : ''}`}
              onClick={() => (isSuccess || isError) && toggleExpand(toolCall.id)}
            >
              {/* 状态图标 */}
              <div className="flex-shrink-0">
                {isRunning && (
                  <Loader2 size={16} className="text-[#10B981] animate-spin" />
                )}
                {isSuccess && (
                  <CheckCircle size={16} className="text-[#10B981]" />
                )}
                {isError && (
                  <XCircle size={16} className="text-red-500" />
                )}
              </div>

              {/* 工具名称和状态 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#374151] truncate">
                    {isRunning ? '正在' : ''}{getToolNameCN(toolCall.function.name)}
                  </span>
                  {isRunning && (
                    <span className="text-xs text-[#9CA3AF]">执行中...</span>
                  )}
                  {isSuccess && (
                    <span className="text-xs text-[#10B981]">完成</span>
                  )}
                  {isError && (
                    <span className="text-xs text-red-500">失败</span>
                  )}
                </div>
              </div>

              {/* 时间信息 */}
              {result && (
                <div className="flex items-center gap-1 text-xs text-[#9CA3AF] flex-shrink-0">
                  <Clock size={12} />
                  <span>{formatTime(result.timestamp || Date.now())}</span>
                </div>
              )}

              {/* 展开/收起按钮 */}
              {(isSuccess || isError) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(toolCall.id);
                  }}
                  className="flex-shrink-0 text-[#9CA3AF] hover:text-[#1E40AF] transition-colors p-1"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              )}
            </div>

            {/* 展开的详情 */}
            <AnimatePresence>
              {isExpanded && result && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="border-t border-gray-100 overflow-hidden"
                >
                  <div className="p-3 space-y-3 bg-gray-50/50">
                    {/* 截断信息提示 */}
                    {result.truncated && (
                      <div className="p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                        <div className="font-medium text-amber-800 mb-1 text-xs">
                          输出过大 ({result.sizeFormatted})
                        </div>
                        <div className="text-amber-700 text-xs break-all">
                          完整输出已保存至: <code className="bg-amber-100 px-1 rounded">{result.savedPath}</code>
                        </div>
                        <div className="text-xs text-amber-600 mt-1">
                          预览 (前 {result.displaySize} 字符):
                        </div>
                      </div>
                    )}

                    {/* 参数 */}
                    <div>
                      <div className="text-xs font-medium text-[#374151] mb-1.5">调用参数</div>
                      <pre className="text-xs bg-white rounded border border-gray-200 p-2.5 overflow-x-auto max-h-[120px] text-[#374151]">
                        {toolCall.function.arguments}
                      </pre>
                    </div>

                    {/* 执行结果 */}
                    {result.result && (
                      <div>
                        <div className="text-xs font-medium text-[#374151] mb-1.5">
                          执行结果
                          {result.truncated && ' (预览)'}
                        </div>
                        <pre className="text-xs bg-white rounded border border-gray-200 p-2.5 overflow-x-auto max-h-[200px] text-[#374151]">
                          {typeof result.result === 'string'
                            ? result.result
                            : JSON.stringify(result.result, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* 错误信息 */}
                    {result.error && (
                      <div className="p-2 bg-red-50 border border-red-200 rounded">
                        <div className="text-xs font-medium text-red-800 mb-1">执行错误</div>
                        <div className="text-xs text-red-600">{result.error}</div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </motion.div>
  );
};

export default ToolCallSimple;
