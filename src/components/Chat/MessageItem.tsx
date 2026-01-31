import React from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Copy, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../utils/cn';
import { Message } from '../../types';
import { useChatStore } from '../../store/chatStore';

interface MessageItemProps {
  message: Message;
  index: number;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, index }) => {
  const { deleteMessage } = useChatStore();
  const isUser = message.role === 'user';

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
  };

  const handleDelete = () => {
    if (window.confirm('确定要删除这条消息吗？')) {
      deleteMessage(index);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      {!isUser && (
        <motion.div
          whileHover={{ scale: 1.1, rotate: 5 }}
          className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-full flex items-center justify-center shadow-lg neon-glow"
        >
          <Bot size={20} className="text-white" />
        </motion.div>
      )}

      <div className={cn("max-w-[75%] space-y-2", isUser && "order-2")}>
        <motion.div
          whileHover={{ scale: 1.02 }}
          className={cn(
            "rounded-2xl p-5 backdrop-blur-xl border border-white/10",
            isUser 
              ? "bg-gradient-to-br from-purple-500/20 to-blue-500/20 text-white/90 shadow-lg" 
              : "glass-dark text-white/90"
          )}
        >
          {message.images && message.images.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {message.images.map((image, idx) => (
                <motion.img
                  key={idx}
                  src={image}
                  alt="附件"
                  className="max-w-[200px] rounded-xl border border-white/20"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                />
              ))}
            </div>
          )}

          <div className={isUser ? 'text-white' : 'text-white/90'}>
            <ReactMarkdown
              components={{
                code({ node, inline, className, children, ...props }: any) {
                  const match = /language-(\w+)/.exec(className || '');
                  return !inline && match ? (
                    <SyntaxHighlighter
                      style={tomorrow}
                      language={match[1]}
                      PreTag="div"
                      {...props}
                    >
                      {String(children).replace(/\n$/, '')}
                    </SyntaxHighlighter>
                  ) : (
                    <code
                      className={cn(
                        className,
                        "px-2 py-1 rounded-lg text-sm font-mono",
                        isUser ? "bg-purple-500/30 text-white" : "bg-white/10 text-white/90"
                      )}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre({ children }: any) {
                  return <div className="overflow-x-auto rounded-lg bg-black/30">{children}</div>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        </motion.div>

        <div className={cn("flex gap-3 text-sm text-white/40", isUser ? "justify-end" : "justify-start")}>
          <span className="opacity-60">{new Date(message.timestamp).toLocaleTimeString()}</span>
          <motion.button
            onClick={handleCopy}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="hover:text-purple-400 transition-colors opacity-0 group-hover:opacity-100"
            title="复制"
          >
            <Copy size={14} />
          </motion.button>
          <motion.button
            onClick={handleDelete}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
            title="删除"
          >
            <Trash2 size={14} />
          </motion.button>
        </div>
      </div>

      {isUser && (
        <motion.div
          whileHover={{ scale: 1.1, rotate: -5 }}
          className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-pink-500 to-purple-500 rounded-full flex items-center justify-center shadow-lg neon-glow"
        >
          <User size={20} className="text-white" />
        </motion.div>
      )}
    </motion.div>
  );
};

export default MessageItem;
