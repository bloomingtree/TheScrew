import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, Trash2, FileText, Star, Terminal, User as UserIcon } from 'lucide-react';
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

// 终端风格色彩常量
const TERMINAL = {
  bg: '#1a1b26',
  bgSecondary: '#24283b',
  bgTertiary: '#414868',
  lightBg: '#fff8f0',
  green: '#9ece6a',
  orange: '#ff9e64',
  blue: '#7aa2f7',
  cyan: '#2ac3de',
  purple: '#bb9af7',
  pink: '#f7768e',
  yellow: '#e0af68',
  textPrimary: '#c0caf5',
  textSecondary: '#565f89',
  textDark: '#1a1b26',
};

// 组件名称首字母头像
const getAvatarInitials = (kind: MessageKind): string => {
  const initials: Record<MessageKind, string> = {
    user: 'U',
    thinking: 'T',
    executing: 'E',
    result: 'A',
  };
  return initials[kind] || '?';
};

// 获取组件颜色
const getKindColor = (kind: MessageKind): string => {
  const colors: Record<MessageKind, string> = {
    user: TERMINAL.green,
    thinking: TERMINAL.orange,
    executing: TERMINAL.cyan,
    result: TERMINAL.blue,
  };
  return colors[kind] || TERMINAL.textPrimary;
};

// 生成星级评分（基于内容长度模拟）
const generateStars = (content: string): number => {
  const length = content.length;
  if (length < 100) return 1;
  if (length < 500) return 2;
  if (length < 1000) return 3;
  if (length < 2000) return 4;
  return 5;
};

const ThreadCard: React.FC<ThreadCardProps> = ({
  message,
  kind,
  index,
  toolResults = [],
  showTimestamp = true
}) => {
  const { deleteMessage } = useChatStore();
  const { openPreview } = useRightPanelStore();
  const config = getKindConfig(kind);
  const [isHovered, setIsHovered] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const kindColor = getKindColor(kind);
  const isUser = kind === 'user';
  const isDark = kind === 'thinking' || kind === 'executing';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
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
        if (result.result.fullPath && isWordFile(result.result.fullPath)) {
          wordFiles.push(result.result.fullPath);
        }
        if (result.result.path && isWordFile(result.result.path)) {
          wordFiles.push(result.result.path);
        }
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

  const stars = generateStars(message.content);
  const avatarInitials = getAvatarInitials(kind);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`relative mb-3 ${isUser ? 'flex justify-end items-end' : 'flex justify-start items-start'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%]`}>
        {/* 消息卡片 */}
        <motion.div
          whileHover={{ y: -1 }}
          transition={{ duration: 0.15 }}
          className={`rounded-xl overflow-hidden border ${
            isDark
              ? 'bg-[#1a1b26] border-[#414868] shadow-lg'
              : 'bg-[#fff8f0] border-[#1a1b26] shadow-md'
          }`}
          style={{
            boxShadow: isDark
              ? '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)'
              : '0 2px 8px rgba(0, 0, 0, 0.08), 0 4px 16px rgba(0, 0, 0, 0.05)',
          }}
        >
          {/* 消息内容区域 */}
          <div className="px-3 py-2">
            {/* 图片附件 */}
            {message.images && message.images.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {message.images.map((image, idx) => (
                  <motion.img
                    key={idx}
                    src={image}
                    alt="附件"
                    className="max-w-[200px] rounded-lg border border-gray-700/30"
                    style={{ boxShadow: '0 2px 8px rgba(0, 0, 0, 0.2)' }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.1 }}
                  />
                ))}
              </div>
            )}

            {/* Markdown 内容 */}
            <div
              className={`prose prose-sm max-w-none prose-p:max-w-none prose-headings:max-w-none ${
                isDark ? 'prose-invert' : ''
              }`}
            >
              <ReactMarkdown
                components={{
                  // 标题样式 - 终端风格
                  h1({ children }) {
                    return (
                      <h1
                        className="text-base font-bold mt-2 mb-2 pb-1 border-b"
                        style={{
                          borderColor: isDark ? '#414868' : '#e8e0d8',
                          color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark,
                        }}
                      >
                        {children}
                      </h1>
                    );
                  },
                  h2({ children }) {
                    return (
                      <h2
                        className="text-sm font-bold mt-2 mb-1"
                        style={{ color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark }}
                      >
                        {children}
                      </h2>
                    );
                  },
                  h3({ children }) {
                    return (
                      <h3
                        className="text-xs font-bold mt-1.5 mb-1"
                        style={{ color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark }}
                      >
                        {children}
                      </h3>
                    );
                  },
                  // 段落样式
                  p({ children }) {
                    return (
                      <p
                        className="my-1 leading-relaxed text-xs w-full"
                        style={{ color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark }}
                      >
                        {children}
                      </p>
                    );
                  },
                  // 列表样式
                  ul({ children }) {
                    return (
                      <ul
                        className="my-1 ml-4 list-disc space-y-0.5"
                        style={{ color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark }}
                      >
                        {children}
                      </ul>
                    );
                  },
                  ol({ children }) {
                    return (
                      <ol
                        className="my-1 ml-4 list-decimal space-y-0.5"
                        style={{ color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark }}
                      >
                        {children}
                      </ol>
                    );
                  },
                  li({ children }) {
                    return <li className="text-xs">{children}</li>;
                  },
                  // 链接样式
                  a({ href, children }) {
                    return (
                      <a
                        href={href}
                        className="underline transition-opacity hover:opacity-80"
                        style={{ color: TERMINAL.cyan }}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {children}
                      </a>
                    );
                  },
                  // 代码块样式 - 终端风格
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <div
                        className="my-2 rounded overflow-hidden"
                        style={{ background: '#1a1b26' }}
                      >
                        <div
                          className="px-3 py-1 text-[10px] font-mono border-b"
                          style={{
                            background: '#24283b',
                            borderColor: '#414868',
                            color: '#565f89',
                          }}
                        >
                          {match[1]}
                        </div>
                        <SyntaxHighlighter
                          style={tomorrow}
                          language={match[1]}
                          customStyle={{
                            borderRadius: 0,
                            fontSize: '11px',
                            margin: 0,
                            background: '#1a1b26',
                          }}
                          {...props}
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <code
                        className="px-1.5 py-0.5 rounded text-[10px] font-mono border"
                        style={{
                          background: isDark ? '#24283b' : '#f5f0e8',
                          color: TERMINAL.cyan,
                          borderColor: isDark ? '#414868' : '#e8e0d8',
                        }}
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
                      <blockquote
                        className="border-l-4 pl-3 py-2 my-2 italic text-xs"
                        style={{
                          borderColor: kindColor,
                          color: isDark ? TERMINAL.textSecondary : '#666',
                        }}
                      >
                        {children}
                      </blockquote>
                    );
                  },
                  // 表格样式
                  table({ children }) {
                    return (
                      <div className="overflow-x-auto my-2">
                        <table className="min-w-full border-separate text-[10px]">{children}</table>
                      </div>
                    );
                  },
                  thead({ children }) {
                    return (
                      <thead
                        style={{
                          background: isDark ? '#24283b' : '#f5f0e8',
                        }}
                      >
                        {children}
                      </thead>
                    );
                  },
                  tbody({ children }) {
                    return <tbody>{children}</tbody>;
                  },
                  tr({ children }) {
                    return (
                      <tr
                        className="border-b"
                        style={{ borderColor: isDark ? '#41486830' : '#e8e0d8' }}
                      >
                        {children}
                      </tr>
                    );
                  },
                  th({ children }) {
                    return (
                      <th
                        className="px-2 py-1.5 text-left font-semibold"
                        style={{ color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark }}
                      >
                        {children}
                      </th>
                    );
                  },
                  td({ children }) {
                    return (
                      <td
                        className="px-2 py-1.5"
                        style={{ color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark }}
                      >
                        {children}
                      </td>
                    );
                  },
                  // 分隔线样式
                  hr() {
                    return (
                      <hr
                        className="my-2 border-dashed"
                        style={{ borderColor: isDark ? '#41486850' : '#e8e0d8' }}
                      />
                    );
                  },
                  // 强调样式
                  strong({ children }) {
                    return (
                      <strong
                        style={{ color: isDark ? TERMINAL.yellow : '#b45309' }}
                      >
                        {children}
                      </strong>
                    );
                  },
                  em({ children }) {
                    return (
                      <em
                        style={{ color: isDark ? TERMINAL.purple : '#7c3aed' }}
                      >
                        {children}
                      </em>
                    );
                  },
                  // 删除线样式
                  del({ children }) {
                    return (
                      <del
                        style={{ color: isDark ? TERMINAL.textSecondary : '#999' }}
                      >
                        {children}
                      </del>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>

            {/* Word文档预览按钮区域 */}
            {wordFiles.length > 0 && (
              <div
                className={`mt-3 pt-2 border-t flex flex-wrap gap-2`}
                style={{ borderColor: isDark ? '#41486830' : '#e8e0d8' }}
              >
                {wordFiles.map((filepath, idx) => (
                  <motion.button
                    key={idx}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => handleOpenPreview(filepath)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all font-mono border"
                    style={{
                      background: isDark ? '#24283b' : '#f5f0e8',
                      color: isDark ? TERMINAL.textPrimary : TERMINAL.textDark,
                      borderColor: isDark ? '#414868' : '#e8e0d8',
                    }}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <FileText size={11} />
                    <span>预览文档</span>
                  </motion.button>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* 悬停工具栏 */}
        <AnimatePresence>
          {isHovered && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 4 }}
              className={`absolute -bottom-10 ${
                isUser ? 'right-0' : 'left-0'
              } flex gap-1 rounded-lg shadow-lg p-1 border font-mono`}
              style={{
                background: isDark ? '#24283b' : '#fff',
                borderColor: isDark ? '#414868' : '#e8e0d8',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              }}
            >
              <button
                onClick={handleCopy}
                className="p-1.5 rounded transition-all flex items-center gap-1 text-[10px]"
                style={{
                  color: isCopied ? TERMINAL.green : isDark ? TERMINAL.textPrimary : '#666',
                }}
                title={isCopied ? '已复制' : '复制'}
              >
                <Copy size={12} />
                {isCopied && <span>已复制</span>}
              </button>
              <button
                onClick={handleDelete}
                className="p-1.5 rounded transition-all text-[10px]"
                style={{
                  color: TERMINAL.pink,
                }}
                title="删除"
              >
                <Trash2 size={12} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* 时间戳（气泡外部下方） */}
      {showTimestamp && (
        <div className="text-[10px] mt-1 whitespace-nowrap font-mono">
          <span style={{ color: isDark ? TERMINAL.textSecondary : '#999' }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default ThreadCard;
