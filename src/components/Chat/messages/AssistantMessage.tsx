import React, { useState, useMemo } from 'react';
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
function extractThinkingFromContent(content: string | null | undefined): { thinking: string | null; cleanContent: string } {
  // 只用 <think >...</think > 标签提取思考内容
  // 注意：流式层（openai.ts 的 ThinkTagParser）已实时解析这些标签，
  // 此函数仅作为持久化消息渲染时的 fallback。
  // 不再用 --- 分隔符作为 fallback（会误把正文中的水平线当成思考边界）

  // content 可能为 null/undefined（纯工具调用消息没有文本内容）
  if (!content) {
    return { thinking: null, cleanContent: '' };
  }

  // 1. 先尝试成对 <think>...</think>
  const thinkRegex = /<think\s*>([\s\S]*?)<\/think\s*>/gi;
  const matches: string[] = [];
  let cleanContent = content.replace(thinkRegex, (_, inner) => {
    matches.push(inner.trim());
    return '';
  });
  if (matches.length > 0) {
    cleanContent = cleanContent.replace(/^\s*\n/, '').replace(/\n\s*$/, '').trim();
    return { thinking: matches.join('\n'), cleanContent };
  }

  // 2. 单边闭合：模型只输出 `思考内容</think>正式回答`（无 <think> 开标签）
  const closeIdx = content.search(/<\/think\s*>/i);
  if (closeIdx !== -1) {
    let thinking = content.substring(0, closeIdx);
    // 剥离残留的孤立 <think> 开标签
    thinking = thinking.replace(/<think\s*>/gi, '').trim();
    const closeMatch = content.match(/<\/think\s*>/i);
    const afterClose = closeMatch
      ? content.substring(closeIdx + closeMatch[0].length)
      : content.substring(closeIdx);
    const cleanContent = afterClose.replace(/^\s*\n/, '').replace(/\n\s*$/, '').trim();
    return { thinking: thinking || null, cleanContent };
  }

  return { thinking: null, cleanContent: content };
}

/** Markdown 渲染配置（顶层回复与嵌套 markdown 代码块共用） */
const markdownComponents = {
  code(props: any) {
    const { inline, className, children, ...rest } = props;
    const match = /language-(\w+)/.exec(className || '');
    // 嵌套的 markdown 代码块：渲染为真实 Markdown（表格/列表等正常显示），而非原始代码
    if (!inline && match && ['markdown', 'md'].includes(match[1])) {
      return (
        <div className="my-2 px-3 py-2 rounded-md border border-gray-200 bg-gray-50 overflow-x-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {String(children).replace(/\n$/, '')}
          </ReactMarkdown>
        </div>
      );
    }
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
  p({ children }: any) {
    return <p className="md-fade-in my-1 text-[#374151] text-sm leading-relaxed">{children}</p>;
  },
  ul({ children }: any) {
    return <ul className="md-fade-in my-1 pl-5 list-disc text-sm text-[#374151]" style={{ listStyleType: 'disc' }}>{children}</ul>;
  },
  ol({ children }: any) {
    return <ol className="md-fade-in my-1 pl-5 list-decimal text-sm text-[#374151]" style={{ listStyleType: 'decimal' }}>{children}</ol>;
  },
  li({ children }: any) {
    return <li className="md-fade-in my-0.5">{children}</li>;
  },
  table({ children }: any) {
    return (
      <div className="md-fade-in overflow-x-auto my-2">
        <table className="min-w-full border-collapse text-sm text-[#374151]">{children}</table>
      </div>
    );
  },
  thead({ children }: any) {
    return <thead className="bg-gray-100">{children}</thead>;
  },
  th({ children }: any) {
    return <th className="border border-gray-300 px-3 py-1.5 text-left font-semibold">{children}</th>;
  },
  td({ children }: any) {
    return <td className="border border-gray-300 px-3 py-1.5">{children}</td>;
  },
};

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

const AssistantMessageImpl: React.FC<AssistantMessageProps> = ({ message }) => {
  const toolResults = useChatStore((s) => s.toolResults);

  // 提取思考内容：优先使用 thinkingContent 字段，其次从 content 中解析 <think > 标签
  // useMemo：流式期间本组件因 toolResults 变化重渲染时，避免重复跑正则提取
  const { thinkingContent, displayContent } = useMemo(() => {
    if (message.thinkingContent) {
      return { thinkingContent: message.thinkingContent, displayContent: message.content };
    }
    const extracted = extractThinkingFromContent(message.content);
    if (extracted.thinking) {
      return { thinkingContent: extracted.thinking, displayContent: extracted.cleanContent };
    }
    return { thinkingContent: null, displayContent: message.content };
  }, [message.thinkingContent, message.content]);

  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 获取此消息的工具调用结果（useMemo 缓存 filter 结果）
  const threadToolResults = useMemo(() => {
    if (!message.tool_calls || message.tool_calls.length === 0) return [];
    const toolCallIds = message.tool_calls.map((tc: any) => tc.id);
    return toolResults.filter(tr => toolCallIds.includes(tr.toolCallId));
  }, [message.tool_calls, toolResults]);

  // 判断工具执行状态
  const toolStatus: 'running' | 'completed' | 'error' = useMemo(() => {
    if (threadToolResults.length === 0) {
      return 'running';
    }
    const hasError = threadToolResults.some(r => !r.success);
    return hasError ? 'error' : 'completed';
  }, [threadToolResults]);

  // Markdown 渲染结果缓存：内容不变时复用同一元素引用，React 会跳过重解析/重高亮。
  // 这是流式期间性能关键 —— 历史消息 content 引用稳定，永远不会重新解析。
  const markdownElement = useMemo(() => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={markdownComponents}
    >
      {displayContent}
    </ReactMarkdown>
  ), [displayContent]);

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
                  {markdownElement}
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
          toolResults={threadToolResults}
          status={toolStatus}
        />
      )}
    </div>
  );
};

// React.memo：消息列表重渲染时，props 未变的历史消息直接跳过（流式期间只有最后一条在变）
const AssistantMessage = React.memo(AssistantMessageImpl);
export default AssistantMessage;
