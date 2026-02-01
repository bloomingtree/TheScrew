import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '../../store/chatStore';
import MessageItem from './MessageItem';
import ToolStatus from '../ToolStatus/ToolStatus';

const MessageList: React.FC = () => {
  const { messages, isStreaming, toolCalls, toolResults } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {messages.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center justify-center h-full"
        >
          
          <p className="text-2xl font-semibold mb-2 text-cream-900">螺丝钉，有什么可以帮助您的吗？</p>
          <p className="text-sm text-cream-600">今天是{new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}</p>
        </motion.div>
      )}

      <ToolStatus
        toolCalls={toolCalls}
        toolResults={toolResults}
        isVisible={isStreaming}
      />

      {messages.map((message, index) => (
        <MessageItem key={message.id} message={message} index={index} />
      ))}

      {isStreaming && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-center"
        >
          <div className="flex gap-2">
            <motion.span
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut" }}
              className="w-2 h-2 bg-purple-400 rounded-full neon-glow"
            />
            <motion.span
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.1 }}
              className="w-2 h-2 bg-blue-400 rounded-full neon-glow"
            />
            <motion.span
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 0.6, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
              className="w-2 h-2 bg-pink-400 rounded-full neon-glow"
            />
          </div>
        </motion.div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
