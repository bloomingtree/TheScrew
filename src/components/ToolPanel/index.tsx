import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, CheckCircle, XCircle, Loader2, Zap, Clock, ChevronDown, ChevronUp, FileCode, Send } from 'lucide-react';
import { cn } from '../../utils/cn';
import { useChatStore } from '../../store/chatStore';
import { ToolExecution } from '../../types';

const ToolPanel: React.FC = () => {
  const { toolCalls, toolResults, isStreaming, toolExecutions } = useChatStore();
  const [expandedExecutions, setExpandedExecutions] = useState<Set<string>>(new Set());

  const toggleExpansion = (toolCallId: string) => {
    setExpandedExecutions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolCallId)) {
        newSet.delete(toolCallId);
      } else {
        newSet.add(toolCallId);
      }
      return newSet;
    });
  };

  const getExecutionStatus = (execution: ToolExecution | undefined) => {
    if (!execution) return 'pending';
    if (execution.endTime === undefined) return 'loading';
    return execution.success ? 'success' : 'error';
  };

  const formatDuration = (ms: number | undefined) => {
    if (ms === undefined) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  return (
    <div className="w-80 border-l border-gray-200/50 flex flex-col bg-white/40 backdrop-blur-sm flex-shrink-0">
      <div className="p-4 border-b border-gray-200/50">
        <div className="flex items-center gap-2">
          <Zap size={18} style={{color: '#00c5d4'}} />
          <h2 className="text-sm font-semibold text-cream-900">工具调用</h2>
          {toolCalls.length > 0 && (
            <span className="ml-auto text-xs font-medium" style={{color: '#00c5d4'}}>
              {toolCalls.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {toolCalls.length === 0 && !isStreaming ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center h-full text-cream-500"
          >
            <Terminal size={32} className="opacity-30 mb-2" />
            <p className="text-xs">暂无工具调用</p>
          </motion.div>
        ) : (
          <>
            <AnimatePresence>
              {toolCalls.map((toolCall, index) => {
                const execution = toolExecutions.get(toolCall.id);
                const result = toolResults.find(r => r.toolCallId === toolCall.id);
                const status = getExecutionStatus(execution);
                const isExpanded = expandedExecutions.has(toolCall.id);

                return (
                  <motion.div
                    key={toolCall.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "rounded-xl border transition-all overflow-hidden",
                      status === 'pending' && "bg-gray-50 border-gray-200",
                      status === 'loading' && "bg-yellow-50 border-yellow-200",
                      status === 'success' && "bg-green-50 border-green-200",
                      status === 'error' && "bg-red-50 border-red-200"
                    )}
                  >
                    <div 
                      className="p-3 cursor-pointer hover:bg-white/50 transition-colors"
                      onClick={() => toggleExpansion(toolCall.id)}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {status === 'pending' && (
                            <div className="w-2 h-2 rounded-full bg-gray-400" />
                          )}
                          {status === 'loading' && (
                            <Loader2 size={14} className="text-yellow-500 animate-spin flex-shrink-0" />
                          )}
                          {status === 'success' && (
                            <CheckCircle size={14} className="text-green-500 flex-shrink-0" />
                          )}
                          {status === 'error' && (
                            <XCircle size={14} className="text-red-500 flex-shrink-0" />
                          )}
                          
                          <span className="text-sm font-medium text-cream-900 truncate">
                            {toolCall.function.name}
                          </span>
                        </div>

                        {execution?.duration !== undefined && (
                          <span className="text-xs text-cream-600 flex-shrink-0 ml-2">
                            {formatDuration(execution.duration)}
                          </span>
                        )}

                        <button
                          className="p-1 text-cream-400 hover:text-cream-700 flex-shrink-0"
                        >
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                      </div>

                      {execution?.description && (
                        <p className="text-xs text-cream-500 ml-4 truncate">
                          {execution.description}
                        </p>
                      )}

                      {execution?.startTime && (
                        <div className="flex items-center gap-1 text-xs text-cream-400 ml-4 mt-1">
                          <Clock size={10} />
                          <span>{formatTimestamp(execution.startTime)}</span>
                        </div>
                      )}
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-gray-200/30"
                        >
                          <div className="p-3 space-y-2">
                            {execution?.arguments && (
                              <div>
                                <div className="flex items-center gap-2 text-xs font-medium text-cream-700 mb-1">
                                  <FileCode size={12} />
                                  <span>参数</span>
                                </div>
                                <pre className="text-[10px] font-mono bg-gray-100/50 p-2 rounded overflow-x-auto">
                                  {JSON.stringify(JSON.parse(execution.arguments), null, 2)}
                                </pre>
                              </div>
                            )}

                            {result && (
                              <div>
                                <div className="flex items-center gap-2 text-xs font-medium text-cream-700 mb-1">
                                  <CheckCircle size={12} className={result.success ? "text-green-500" : "text-red-500"} />
                                  <span>结果</span>
                                </div>
                                <div className={cn(
                                  "text-[10px] font-mono p-2 rounded overflow-x-auto",
                                  result.success 
                                    ? "bg-green-100/50 text-green-800"
                                    : "bg-red-100/50 text-red-800"
                                )}>
                                  <pre className="whitespace-pre-wrap">
                                    {result.success 
                                      ? JSON.stringify(result.result, null, 2)
                                      : result.error || 'Unknown error'
                                    }
                                  </pre>
                                </div>
                                
                                {execution?.success === true && (
                                  <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="mt-2 flex items-center gap-1 text-xs text-green-600"
                                  >
                                    <Send size={10} />
                                    <span>结果已发送给模型</span>
                                  </motion.div>
                                )}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </>
        )}
      </div>

      {isStreaming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="p-4 border-t border-gray-200/50 flex-shrink-0"
            style={{backgroundColor: 'rgba(0, 197, 212, 0.1)'}}
        >
          <div className="flex items-center gap-2 text-xs" style={{color: '#034c7a'}}>
            <Loader2 size={14} className="animate-spin" />
            <span>模型正在思考...</span>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default ToolPanel;
