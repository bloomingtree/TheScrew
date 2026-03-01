import React from 'react';
import { motion } from 'framer-motion';
import ToolCallSimple from '../ToolCallSimple';
import { useChatStore } from '../../../store/chatStore';

interface AssistantMessageProps {
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: any[];
    timestamp?: number;
  };
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  const { toolResults } = useChatStore();

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取此消息的工具调用结果
  const getThreadToolResults = () => {
    if (!message.tool_calls || message.tool_calls.length === 0) return [];
    const toolCallIds = message.tool_calls.map((tc: any) => tc.id);
    return toolResults.filter(tr => toolCallIds.includes(tr.toolCallId));
  };

  // 判断工具执行状态
  const getToolStatus = (): 'running' | 'completed' | 'error' => {
    const results = getThreadToolResults();
    if (results.length === 0) {
      return 'running';
    }
    const hasError = results.some(r => !r.success);
    return hasError ? 'error' : 'completed';
  };

  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasContent = message.content && message.content.trim();

  return (
    <div className="mb-3">
      {/* 如果有工具调用，显示工具调用 */}
      {hasToolCalls && (
        <ToolCallSimple
          toolCalls={message.tool_calls}
          toolResults={getThreadToolResults()}
          status={getToolStatus()}
        />
      )}

      {/* 如果有内容，显示回复 */}
      {hasContent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative flex justify-start items-start"
        >
          <div className="flex flex-col items-start max-w-[85%]">
            {/* 消息气泡 */}
            <div className="rounded-xl overflow-hidden border bg-[#1a1b26] border-[#414868] shadow-lg">
              <div className="px-3 py-2">
                <div className="prose prose-sm max-w-none prose-p:max-w-none prose-headings:max-w-none prose-invert">
                  <div className="text-[#c0caf5] text-sm leading-relaxed whitespace-pre-wrap">
                    {message.content}
                  </div>
                </div>
              </div>
            </div>
            {/* 时间戳 */}
            {message.timestamp && (
              <div className="text-[10px] mt-1 whitespace-nowrap font-mono" style={{ color: 'rgb(86, 95, 137)' }}>
                {formatTime(message.timestamp)}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default AssistantMessage;
