import React from 'react';
import { motion } from 'framer-motion';
import { Copy, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message } from '../../types';
import { getKindConfig, MessageKind } from '../../types/thread';
import { useChatStore } from '../../store/chatStore';

interface ThreadCardProps {
  message: Message;
  kind: MessageKind;
  index: number;
  threadId?: string;
}

const ThreadCard: React.FC<ThreadCardProps> = ({ message, kind, index }) => {
  const { deleteMessage } = useChatStore();
  const config = getKindConfig(kind);

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="relative"
    >
      {/* 类型标签 */}
      <div
        className="absolute -top-2 -left-2 px-2 py-1 rounded text-xs font-medium shadow-sm z-10"
        style={{ backgroundColor: config.bgColor, color: config.textColor }}
      >
        {config.label}
      </div>

      {/* 卡片主体 */}
      <div
        className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 hover:shadow-md hover:border-gray-300 transition-all"
      >
        {/* 图片附件 */}
        {message.images && message.images.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {message.images.map((image, idx) => (
              <motion.img
                key={idx}
                src={image}
                alt="附件"
                className="max-w-[200px] rounded-lg border border-gray-200"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.1 }}
              />
            ))}
          </div>
        )}

        {/* 消息内容 */}
        <div className="text-[#374151] prose prose-sm max-w-none">
          <ReactMarkdown
            components={{
              // 标题样式
              h1({ children }) {
                return <h1 className="text-xl font-bold mt-4 mb-2 text-[#1E40AF]">{children}</h1>;
              },
              h2({ children }) {
                return <h2 className="text-lg font-bold mt-3 mb-2 text-[#1E40AF]">{children}</h2>;
              },
              h3({ children }) {
                return <h3 className="text-base font-bold mt-3 mb-2 text-[#374151]">{children}</h3>;
              },
              h4({ children }) {
                return <h4 className="text-sm font-bold mt-2 mb-1 text-[#374151]">{children}</h4>;
              },
              // 段落样式
              p({ children }) {
                return <p className="my-2 leading-relaxed">{children}</p>;
              },
              // 列表样式
              ul({ children }) {
                return <ul className="my-2 ml-4 list-disc space-y-1">{children}</ul>;
              },
              ol({ children }) {
                return <ol className="my-2 ml-4 list-decimal space-y-1">{children}</ol>;
              },
              li({ children }) {
                return <li className="text-sm">{children}</li>;
              },
              // 链接样式
              a({ href, children }) {
                return (
                  <a
                    href={href}
                    className="text-[#1E40AF] hover:text-[#3B82F6] underline"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {children}
                  </a>
                );
              },
              // 代码块样式
              code({ node, inline, className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || '');
                return !inline && match ? (
                  <SyntaxHighlighter
                    style={tomorrow}
                    language={match[1]}
                    PreTag="div"
                    customStyle={{
                      borderRadius: '0.5rem',
                      fontSize: '0.875rem',
                    }}
                    {...props}
                  >
                    {String(children).replace(/\n$/, '')}
                  </SyntaxHighlighter>
                ) : (
                  <code
                    className="px-1.5 py-0.5 rounded text-sm font-mono bg-gray-100 text-gray-800"
                    {...props}
                  >
                    {children}
                  </code>
                );
              },
              pre({ children }: any) {
                return <div className="overflow-x-auto rounded my-2">{children}</div>;
              },
              // 引用样式
              blockquote({ children }) {
                return (
                  <blockquote className="border-l-4 border-gray-300 pl-4 py-1 my-2 italic text-gray-600">
                    {children}
                  </blockquote>
                );
              },
              // 表格样式
              table({ children }) {
                return (
                  <div className="overflow-x-auto my-2">
                    <table className="min-w-full border border-gray-200 rounded">{children}</table>
                  </div>
                );
              },
              thead({ children }) {
                return <thead className="bg-gray-50">{children}</thead>;
              },
              tbody({ children }) {
                return <tbody>{children}</tbody>;
              },
              tr({ children }) {
                return <tr className="border-b border-gray-200">{children}</tr>;
              },
              th({ children }) {
                return <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">{children}</th>;
              },
              td({ children }) {
                return <td className="px-3 py-2 text-sm">{children}</td>;
              },
              // 分隔线样式
              hr() {
                return <hr className="my-4 border-gray-200" />;
              },
              // 强调样式
              strong({ children }) {
                return <strong className="font-bold text-[#1E40AF]">{children}</strong>;
              },
              em({ children }) {
                return <em className="italic">{children}</em>;
              },
              // 删除线样式
              del({ children }) {
                return <del className="line-through text-gray-500">{children}</del>;
              },
            }}
          >
            {message.content}
          </ReactMarkdown>
        </div>

        {/* 底部工具栏 */}
        <div className="flex gap-3 text-sm text-[#9CA3AF] mt-3 pt-3 border-t border-gray-100">
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          <button
            onClick={handleCopy}
            className="hover:text-[#1E40AF] transition-colors"
            title="复制"
          >
            <Copy size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="hover:text-red-500 transition-colors"
            title="删除"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};

export default ThreadCard;
