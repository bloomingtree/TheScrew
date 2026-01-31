import React, { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import MessageItem from './MessageItem';

const MessageList: React.FC = () => {
  const { messages, isStreaming } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {messages.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-center justify-center h-full text-white/60"
        >
          <motion.div
            animate={{ 
              scale: [1, 1.2, 1],
              rotate: [0, 5, -5, 0]
            }}
            transition={{ 
              duration: 3,
              repeat: Infinity,
              ease: "easeInOut"
            }}
            className="mb-6"
          >
            <Sparkles size={64} className="text-purple-400 neon-glow" />
          </motion.div>
          <p className="text-2xl font-semibold mb-2 text-white">👋 欢迎使用 0号员工</p>
          <p className="text-sm text-white/50">开始你的第一次对话吧！</p>
        </motion.div>
      )}

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
