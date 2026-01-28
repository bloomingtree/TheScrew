import React, { useEffect, useRef } from 'react';
import { useChatStore } from '../../store/chatStore';
import MessageItem from './MessageItem';

const MessageList: React.FC = () => {
  const { messages, isStreaming } = useChatStore();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.length === 0 && (
        <div className="flex items-center justify-center h-full text-gray-400">
          <div className="text-center">
            <p className="text-lg mb-2">👋 欢迎使用 0号员工</p>
            <p className="text-sm">开始你的第一次对话吧！</p>
          </div>
        </div>
      )}

      {messages.map((message, index) => (
        <MessageItem key={message.id} message={message} index={index} />
      ))}

      {isStreaming && (
        <div className="flex justify-center">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
            <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
          </div>
        </div>
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
