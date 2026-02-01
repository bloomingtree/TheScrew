import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';
import { ToolCall, ToolResult } from '../../types';

interface ToolStatusProps {
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  isVisible: boolean;
}

const ToolStatus: React.FC<ToolStatusProps> = ({
  toolCalls,
  toolResults,
  isVisible,
}) => {
  if (!isVisible || toolCalls.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="mx-4 mb-4 glass rounded-xl border border-white/10 overflow-hidden"
    >
      <div className="px-4 py-3 bg-white/5 border-b border-white/10 flex items-center gap-2">
        <Terminal size={16} className="text-purple-400" />
        <span className="text-sm font-medium text-white/90">工具调用</span>
      </div>

      <div className="p-4 space-y-3">
        {toolCalls.map((toolCall) => {
          const result = toolResults.find(r => r.toolCallId === toolCall.id);

          return (
            <motion.div
              key={toolCall.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "p-3 rounded-lg border border-white/10",
                "bg-white/5"
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      !result && "bg-yellow-400",
                      result?.success && "bg-green-400",
                      result && !result.success && "bg-red-400"
                    )}
                  />
                  <span className="text-sm font-medium text-white/90">
                    {toolCall.function.name}
                  </span>
                </div>

                {!result && (
                  <Loader2 size={14} className="text-yellow-400 animate-spin" />
                )}

                {result?.success && (
                  <CheckCircle size={14} className="text-green-400" />
                )}

                {result && !result.success && (
                  <XCircle size={14} className="text-red-400" />
                )}
              </div>

              {result && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className={cn(
                    "mt-2 p-2 rounded text-xs font-mono",
                    result.success
                      ? "bg-green-500/10 text-green-300 border border-green-500/20"
                      : "bg-red-500/10 text-red-300 border border-red-500/20"
                  )}
                >
                  {result.success ? (
                    <pre className="whitespace-pre-wrap overflow-x-auto max-h-[200px]">
                      {JSON.stringify(result.result, null, 2)}
                    </pre>
                  ) : (
                    <div className="font-medium">{result.error || 'Unknown error'}</div>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};

export default ToolStatus;