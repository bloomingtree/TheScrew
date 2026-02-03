import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Trash2, FileText } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, ToolResult } from '../../types';
import { getKindConfig, MessageKind } from '../../types/thread';
import { useChatStore } from '../../store/chatStore';
import { useRightPanelStore } from '../../store/rightPanelStore';

interface ThreadCardProps {
  message: Message;
  kind: MessageKind;
  index: number;
  threadId?: string;
  toolResults?: ToolResult[];
  showTimestamp?: boolean;
}

const ThreadCard: React.FC<ThreadCardProps> = ({ message, kind, index, toolResults = [], showTimestamp = true }) => {
  const { deleteMessage } = useChatStore();
  const { openPreview } = useRightPanelStore();
  const config = getKindConfig(kind);
  const [isHovered, setIsHovered] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
  };

  const handleDelete = () => {
    if (window.confirm('确定要删除这条消息吗？')) {
      deleteMessage(index);
    }
  };

  // 检测是否是Word文档
  const isWordFile = (filepath?: string): boolean => {
    if (!filepath) return false;
    return filepath.toLowerCase().endsWith('.docx');
  };

  // 从工具结果中提取Word文件路径
  const getWordFilesFromResults = (): string[] => {
    const wordFiles: string[] = [];

    for (const result of toolResults) {
      if (result.success && result.result) {
        // 检查 result.result.fullPath (create_word 返回的路径)
        if (result.result.fullPath && isWordFile(result.result.fullPath)) {
          wordFiles.push(result.result.fullPath);
        }
        // 检查 result.result.path (相对路径)
        if (result.result.path && isWordFile(result.result.path)) {
          wordFiles.push(result.result.path);
        }
        // 检查 savedPath (截断结果保存的路径)
        if (result.savedPath && isWordFile(result.savedPath)) {
          wordFiles.push(result.savedPath);
        }
      }
    }

    return wordFiles;
  };

  const wordFiles = getWordFilesFromResults();

  // 打开Word预览 - 使用右侧面板
  const handleOpenPreview = (filepath: string) => {
    openPreview(filepath);
  };

  // 判断是否是用户消息
  const isUser = kind === 'user';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`relative mb-2 ${isUser ? 'flex justify-end items-end' : 'flex justify-start items-start'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        {/* 消息气泡 */}
        <div
          className={`relative max-w-[80%] min-w-fit ${
            isUser
              ? 'bg-[#8774E1] text-white rounded-2xl rounded-br-none'
              : 'bg-white text-gray-900 border border-gray-200 rounded-2xl rounded-bl-none'
          } shadow-sm`}
        >
        {/* 消息内容 */}
        <div className={`px-3 py-1 ${isUser ? 'text-white' : 'text-gray-900'}`}>
          {/* 图片附件 */}
          {message.images && message.images.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2">
              {message.images.map((image, idx) => (
                <motion.img
                  key={idx}
                  src={image}
                  alt="附件"
                  className="max-w-[200px] rounded-lg"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                />
              ))}
            </div>
          )}

          {/* Markdown 内容 */}
          <div className={`prose prose-sm max-w-none prose-p:max-w-none prose-headings:max-w-none ${isUser ? 'prose-invert' : ''}`}>
            <ReactMarkdown
              components={{
                // 标题样式
                h1({ children }) {
                  return <h1 className="text-lg font-bold mt-2 mb-1">{children}</h1>;
                },
                h2({ children }) {
                  return <h2 className="text-base font-bold mt-2 mb-1">{children}</h2>;
                },
                h3({ children }) {
                  return <h3 className="text-sm font-bold mt-1.5 mb-1">{children}</h3>;
                },
                h4({ children }) {
                  return <h4 className="text-sm font-semibold mt-1 mb-1">{children}</h4>;
                },
                // 段落样式
                p({ children }) {
                  return <p className="my-1 leading-relaxed text-sm w-full">{children}</p>;
                },
                // 列表样式
                ul({ children }) {
                  return <ul className="my-1 ml-4 list-disc space-y-0.5">{children}</ul>;
                },
                ol({ children }) {
                  return <ol className="my-1 ml-4 list-decimal space-y-0.5">{children}</ol>;
                },
                li({ children }) {
                  return <li className="text-sm">{children}</li>;
                },
                // 链接样式
                a({ href, children }) {
                  return (
                    <a
                      href={href}
                      className={`${isUser ? 'text-white underline' : 'text-[#64B5F6] hover:text-[#4A90E2]'} underline`}
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
                    <div className="my-2 rounded overflow-hidden">
                      <SyntaxHighlighter
                        style={tomorrow}
                        language={match[1]}
                        customStyle={{
                          borderRadius: 0,
                          fontSize: '0.75rem',
                          margin: 0,
                        }}
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    </div>
                  ) : (
                    <code
                      className={`px-1.5 py-0.5 rounded text-xs font-mono ${
                        isUser ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-800'
                      }`}
                      {...props}
                    >
                      {children}
                    </code>
                  );
                },
                pre({ children }: any) {
                  return <div className="overflow-x-auto">{children}</div>;
                },
                // 引用样式
                blockquote({ children }) {
                  return (
                    <blockquote className={`border-l-2 pl-3 py-1 my-2 italic text-sm ${
                      isUser ? 'border-white/30 text-white/70' : 'border-gray-300 text-gray-600'
                    }`}>
                      {children}
                    </blockquote>
                  );
                },
                // 表格样式
                table({ children }) {
                  return (
                    <div className="overflow-x-auto my-2">
                      <table className="min-w-full border-separate text-xs">{children}</table>
                    </div>
                  );
                },
                thead({ children }) {
                  return <thead className={isUser ? 'bg-white/10' : 'bg-gray-50'}>{children}</thead>;
                },
                tbody({ children }) {
                  return <tbody>{children}</tbody>;
                },
                tr({ children }) {
                  return <tr className={isUser ? 'border-white/10' : 'border-gray-200'}>{children}</tr>;
                },
                th({ children }) {
                  return <th className="px-2 py-1 text-left font-semibold">{children}</th>;
                },
                td({ children }) {
                  return <td className="px-2 py-1">{children}</td>;
                },
                // 分隔线样式
                hr() {
                  return <hr className={`my-2 ${isUser ? 'border-white/20' : 'border-gray-200'}`} />;
                },
                // 强调样式
                strong({ children }) {
                  return <strong className="font-semibold">{children}</strong>;
                },
                em({ children }) {
                  return <em className="italic">{children}</em>;
                },
                // 删除线样式
                del({ children }) {
                  return <del className={isUser ? 'line-through opacity-60' : 'line-through text-gray-500'}>{children}</del>;
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>

          {/* Word文档预览按钮区域 */}
          {wordFiles.length > 0 && (
            <div className={`mt-3 pt-2 border-t ${isUser ? 'border-white/20' : 'border-gray-100'}`}>
              <div className={`flex flex-wrap gap-2`}>
                {wordFiles.map((filepath, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => handleOpenPreview(filepath)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      isUser
                        ? 'bg-white/20 hover:bg-white/30 text-white'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                    }`}
                  >
                    <FileText size={12} />
                    <span>预览文档</span>
                  </motion.button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 悬停工具栏 */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`absolute -bottom-8 ${
                isUser ? 'right-0' : 'left-0'
              } flex gap-1 bg-white rounded-lg shadow-lg border border-gray-200 p-1`}
            >
              <button
                onClick={handleCopy}
                className={`p-1.5 rounded transition-colors ${
                  isUser ? 'hover:bg-gray-100 text-gray-700' : 'hover:bg-gray-100 text-gray-600'
                }`}
                title="复制"
              >
                <Copy size={14} />
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 rounded hover:bg-red-50 hover:text-red-600 text-gray-400 transition-colors"
                title="删除"
              >
                <Trash2 size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 时间戳（气泡外部下方） */}
      {showTimestamp && (
        <div className="text-[10px] mt-1 whitespace-nowrap">
          <span className={isUser ? 'text-white/60' : 'text-gray-400'}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
    </div>
  </motion.div>
  );
};

export default ThreadCard;
