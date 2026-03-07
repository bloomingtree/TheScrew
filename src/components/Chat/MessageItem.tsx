import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { User, Bot, Copy, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { cn } from '../../utils/cn';
import { extractTextFromContent } from '../../utils/messageContent';
import { Message } from '../../types';
import { useChatStore } from '../../store/chatStore';
import { parseEmoji } from '../../utils/twemoji';

interface MessageItemProps {
  message: Message;
  index: number;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, index }) => {
  const { deleteMessage } = useChatStore();
  const isUser = message.role === 'user';

  // 提取文本内容（处理多模态格式）
  const textContent = extractTextFromContent(message.content as any);

  const handleCopy = () => {
    navigator.clipboard.writeText(textContent);
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
        <div
          className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-primary-blue to-primary-cyan rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all"
        >
          <Bot size={20} className="text-white" />
        </div>
      )}

      <div className={cn("max-w-[75%] space-y-2", isUser && "order-2")}>
        <div
          className={cn(
            "rounded-2xl p-5 backdrop-blur-xl border border-gray-200/50",
            isUser
              ? "bg-gradient-to-br from-primary-blue/10 to-primary-cyan/10 text-cream-900 shadow-lg hover:shadow-md transition-all"
              : "bg-white/80 text-cream-900 hover:shadow-md transition-all"
          )}
        >
          {message.images && message.images.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-2">
              {message.images.map((image, idx) => (
                <motion.img
                  key={idx}
                  src={image}
                  alt="附件"
                  className="max-w-[200px] rounded-xl border border-gray-200/50"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                />
              ))}
            </div>
          )}

          <div className={isUser ? 'text-cream-900 text-base' : 'text-cream-900 text-base'}>
            <ReactMarkdown
              components={{
                // 处理纯文本，将 emoji 转换为 twemoji 图片
                text({ children }) {
                  if (typeof children === 'string') {
                    // 检查是否包含 emoji
                    const hasEmoji = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E0}-\u{1F1FF}]/u.test(children);
                    if (hasEmoji) {
                      return <span dangerouslySetInnerHTML={{ __html: parseEmoji(children) }} />;
                    }
                  }
                  return <>{children}</>;
                },
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
                        "px-2 py-1 rounded-lg text-base font-mono",
                        isUser ? "bg-purple-500/20 text-cream-900" : "bg-gray-200/50 text-cream-900"
                      )}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre({ children }: any) {
                  return <div className="overflow-x-auto rounded-lg bg-gray-100/50">{children}</div>;
                },
              }}
            >
              {textContent}
            </ReactMarkdown>
          </div>
        </div>

        <div className={cn("flex gap-3 text-sm text-cream-400", isUser ? "justify-end" : "justify-start")}>
          <span className="opacity-60">{new Date(message.timestamp).toLocaleTimeString()}</span>
          <button
            onClick={handleCopy}
            className="hover:text-primary-blue transition-colors opacity-0 group-hover:opacity-100"
            title="复制"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {isUser && (
        <div
          className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-primary-orange to-pink-500 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all"
        >
          <User size={20} className="text-white" />
        </div>
      )}
    </motion.div>
  );
};

export default MessageItem;
