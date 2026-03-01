import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '../../store/chatStore';
import UserMessage from './messages/UserMessage';
import AssistantMessage from './messages/AssistantMessage';
import ToolCallSimple from './ToolCallSimple';

const MessageList: React.FC = () => {
  const { messages, isStreaming } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  // 简单的顺序渲染：每条消息独立渲染
  const renderMessage = (message: any, index: number) => {
    // user 消息
    if (message.role === 'user') {
      return (
        <UserMessage
          key={`msg-${index}`}
          message={message}
        />
      );
    }

    // assistant 消息
    if (message.role === 'assistant') {
      return (
        <AssistantMessage
          key={`msg-${index}`}
          message={message}
        />
      );
    }

    // tool 消息（不直接渲染，工具调用通过 AssistantMessage 的 tool_calls 显示）
    return null;
  };

  return (
    <div className="h-full overflow-y-auto py-6 px-4">
      {/* 居中布局容器 */}
      <div className="max-w-[1600px] mx-auto">
        {messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="flex flex-col items-center justify-center h-full"
          >
            <p className="text-2xl font-semibold mb-2 text-[#374151]">螺丝钉，有什么可以帮助您的吗？</p>
            <p className="text-sm text-[#9CA3AF]">今天是{new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}</p>
          </motion.div>
        )}

        {/* 顺序渲染每条消息 */}
        {messages.map((message, index) => renderMessage(message, index))}

        {/* 流式响应加载指示器 */}
        {isStreaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex justify-center py-4"
          >
            <div className="flex gap-2">
              <motion.span
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
                className="w-2 h-2 bg-[#10B981] rounded-full"
              />
              <motion.span
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
                className="w-2 h-2 bg-[#abc88b] rounded-full"
              />
              <motion.span
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
                className="w-2 h-2 bg-[#8B5CF6] rounded-full"
              />
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};

export default MessageList;
