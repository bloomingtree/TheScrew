import React from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import ToolCallSimple from '../ToolCallSimple';
import { useChatStore } from '../../../store/chatStore';

interface AssistantMessageProps {
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: any[];
    timestamp?: number;
  };
}

const AssistantMessage: React.FC<AssistantMessageProps> = ({ message }) => {
  const { toolResults } = useChatStore();

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
  const hasContent = message.content && message.content.trim();

  return (
    <div className="mb-3">
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
            <div className="rounded-xl overflow-hidden border bg-white border-gray-200 shadow-lg">
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
                        return <ul className="my-1 ml-4 list-disc text-sm text-[#374151]">{children}</ul>;
                      },
                      ol({ children }) {
                        return <ol className="my-1 ml-4 list-decimal text-sm text-[#374151]">{children}</ol>;
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
                    {message.content}
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
