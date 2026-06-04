import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';
import ToolCallSimple from '../ToolCallSimple';
import { useChatStore } from '../../../store/chatStore';

interface AssistantMessageProps {
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: any[];
    timestamp?: number;
    thinkingContent?: string;
  };
}

/** 从 content 中提取思考内容（作为 fallback）
 *  支持三种格式：
 *  1. <think >...</think > 标签（QwQ/DeepSeek 等模型）
 *  2. --- 分隔符（模型在 content 中用 --- 分割思考与正式回答）
 *  3. reasoning_content 字段（由 OpenAI client 在流式层处理）
 */
function extractThinkingFromContent(content: string): { thinking: string | null; cleanContent: string } {
  // 1. 先尝试 <think > 标签
  const thinkRegex = /<think\s*>([\s\S]*?)<\/think\s*>/gi;
  const matches: string[] = [];
  let cleanContent = content.replace(thinkRegex, (_, inner) => {
    matches.push(inner.trim());
    return '';
  });
  cleanContent = cleanContent.replace(/^\s*\n/, '').replace(/\n\s*$/, '').trim();
  if (matches.length > 0) {
    return { thinking: matches.join('\n'), cleanContent };
  }

  // 2. 尝试 --- 分隔符（第一个独立行的 --- 作为分界线）
  const separatorRegex = /^[ \t]*---[ \t]*$/m;
  const separatorIdx = content.search(separatorRegex);
  if (separatorIdx > 0) {
    // 分隔符之前的内容作为思考，之后的内容作为正式回答
    const before = content.substring(0, separatorIdx).trim();
    const after = content.substring(separatorIdx).replace(separatorRegex, '').trim();
    // 只有当分隔符前有实质内容时才视为思考内容
    if (before.length > 0 && after.length > 0) {
      return { thinking: before, cleanContent: after };
    }
  }

  return { thinking: null, cleanContent: content };
}

/** 思考折叠块组件 */
const ThinkingBlock: React.FC<{ content: string }> = ({ content }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-colors hover:bg-gray-100"
        style={{ color: '#7c3aed' }}
      >
        <Brain size={14} />
        <span>思考过程</span>
        {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div
              className="mt-1 px-3 py-2 rounded-lg text-xs leading-relaxed max-h-60 overflow-y-auto border"
              style={{
                backgroundColor: '#faf5ff',
                borderColor: '#e9d5ff',
                color: '#6b21a8',
              }}
            >
              {content}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  const { toolResults } = useChatStore();

  // 提取思考内容：优先使用 thinkingContent 字段，其次从 content 中解析 <think > 标签
  let thinkingContent = message.thinkingContent || null;
  let displayContent = message.content;

  if (!thinkingContent) {
    const extracted = extractThinkingFromContent(message.content);
    if (extracted.thinking) {
      thinkingContent = extracted.thinking;
      displayContent = extracted.cleanContent;
    }
  }

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取此消息的工具调用结果
  const getThreadToolResults = () => {
    if (!message.tool_calls || message.tool_calls.length === 0) return [];
    const toolCallIds = message.tool_calls.map((tc: any) => tc.id);
    return toolResults.filter(tr => toolCallIds.includes(tr.toolCallId));
  };

  // 判断工具执行状态
  const getToolStatus = (): 'running' | 'completed' | 'error' => {
    const results = getThreadToolResults();
    if (results.length === 0) {
      return 'running';
    }
    const hasError = results.some(r => !r.success);
    return hasError ? 'error' : 'completed';
  };

  const hasToolCalls = message.tool_calls && message.tool_calls.length > 0;
  const hasContent = displayContent && displayContent.trim();

  return (
    <div className="mb-3">
      {/* 思考内容折叠块 */}
      {thinkingContent && (
        <ThinkingBlock content={thinkingContent} />
      )}

      {/* 如果有内容，显示回复 */}
      {hasContent && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="relative flex justify-start items-start"
        >
          <div className="flex flex-col items-start max-w-[85%]">
            {/* 消息气泡 */}
            <div className="rounded-xl border bg-white border-gray-200 shadow-lg">
              <div className="px-3 py-2">
                <div className="prose prose-sm max-w-none prose-p:max-w-none prose-headings:max-w-none">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      code(props: any) {
                        const { inline, className, children, ...rest } = props;
                        const match = /language-(\w+)/.exec(className || '');
                        return !inline && match ? (
                          <SyntaxHighlighter
                            style={vscDarkPlus as any}
                            language={match[1]}
                            PreTag="div"
                            customStyle={{ borderRadius: '6px', fontSize: '13px' }}
                            {...rest}
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code
                            className="px-1.5 py-0.5 rounded text-xs font-mono"
                            style={{ backgroundColor: '#f3f4f6', color: '#e11d48' }}
                            {...rest}
                          >
                            {children}
                          </code>
                        );
                      },
                      p({ children }) {
                        return <p className="my-1 text-[#374151] text-sm leading-relaxed">{children}</p>;
                      },
                      ul({ children }) {
                        return <ul className="my-1 pl-5 list-disc text-sm text-[#374151]" style={{ listStyleType: 'disc' }}>{children}</ul>;
                      },
                      ol({ children }) {
                        return <ol className="my-1 pl-5 list-decimal text-sm text-[#374151]" style={{ listStyleType: 'decimal' }}>{children}</ol>;
                      },
                      li({ children }) {
                        return <li className="my-0.5">{children}</li>;
                      },
                      table({ children }) {
                        return (
                          <div className="overflow-x-auto my-2">
                            <table className="min-w-full border-collapse text-sm text-[#374151]">{children}</table>
                          </div>
                        );
                      },
                      thead({ children }) {
                        return <thead className="bg-gray-100">{children}</thead>;
                      },
                      th({ children }) {
                        return <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">{children}</th>;
                      },
                      td({ children }) {
                        return <td className="border border-gray-300 px-3 py-1.5">{children}</td>;
                      },
                    }}
                  >
                    {displayContent}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
            {/* 时间戳 */}
            {message.timestamp && (
              <div className="text-[10px] mt-1 whitespace-nowrap font-mono" style={{ color: 'rgb(86, 95, 137)' }}>
                {formatTime(message.timestamp)}
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* 如果有工具调用，显示工具调用 */}
      {hasToolCalls && (
        <ToolCallSimple
          toolCalls={message.tool_calls || []}
          toolResults={getThreadToolResults()}
          status={getToolStatus()}
        />
      )}
    </div>
  );
};

export default AssistantMessage;
