import React from 'react';
import { motion } from 'framer-motion';

interface UserMessageProps {
  message: {
    role: 'user';
    content: string;
    timestamp?: number;
    images?: string[];
  };
}

const UserMessage: React.FC<UserMessageProps> = ({ message }) => {
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative mb-3 flex justify-end items-end"
    >
      <div className="flex flex-col items-end max-w-[85%]">
        {/* 消息气泡 */}
        <div className="rounded-xl overflow-hidden bg-[#fff8f0] shadow-md">
          <div className="px-3 py-2">
            {/* 图片 */}
            {message.images && message.images.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {message.images.map((img, idx) => (
                  <img
                    key={idx}
                    src={img}
                    alt={`上传的图片${idx + 1}`}
                    className="max-w-[200px] rounded-lg"
                  />
                ))}
              </div>
            )}
            {/* 文本内容 */}
            <div className="prose prose-sm max-w-none prose-p:max-w-none prose-headings:max-w-none">
              <p className="my-1 leading-relaxed text-sm w-full">
                {message.content}
              </p>
            </div>
          </div>
        </div>
        {/* 时间戳 */}
        {message.timestamp && (
          <div className="text-[10px] mt-1 whitespace-nowrap font-mono" style={{ color: 'rgb(153, 153, 153)' }}>
            {formatTime(message.timestamp)}
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default UserMessage;
