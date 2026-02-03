import React, { useEffect, useRef, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '../../store/chatStore';
import MessageThread from './MessageThread';
import { groupMessages } from '../../utils/messageGrouping';

const MessageList: React.FC = () => {
  const { messages, isStreaming } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 使用 useMemo 缓存分组结果
  const threads = useMemo(() => groupMessages(messages), [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="h-full overflow-y-auto py-6 px-4">
      {/* 居中布局容器 */}
      <div className="max-w-[1600px] mx-auto space-y-6">
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

        {/* 渲染消息线程 */}
        {threads.map((thread, index) => {
          // 获取前一个线程的最后一条消息类型，用于判断是否显示时间戳
          const prevThread = index > 0 ? threads[index - 1] : null;
          return (
            <MessageThread
              key={thread.id}
              thread={thread}
              messageIndexStart={index * 10}
              prevThread={prevThread}
            />
          );
        })}

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
                className="w-2 h-2 bg-[#1E40AF] rounded-full"
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
