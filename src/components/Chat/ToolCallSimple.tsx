import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, ChevronDown, ChevronUp, CheckCircle, XCircle, Clock, Eye, Terminal } from 'lucide-react';
import { ToolCall, ToolResult } from '../../types';
import { getToolNameCN } from '../../types/thread';
import { WordPreviewDialog } from '../WordPreview';

interface ToolCallSimpleProps {
  toolCalls: ToolCall[];
  toolResults?: ToolResult[];
  status: 'running' | 'completed' | 'error';
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

const ToolCallSimple: React.FC<ToolCallSimpleProps> = ({
  toolCalls,
  toolResults = [],
}) => {
  const [expandedCalls, setExpandedCalls] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<string | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 检测是否是Word文档
  const isWordFile = (filepath?: string): boolean => {
    if (!filepath) return false;
    return filepath.toLowerCase().endsWith('.docx');
  };

  const toggleExpand = (toolCallId: string) => {
    setExpandedCalls(prev => {
      const newSet = new Set(prev);
      if (newSet.has(toolCallId)) {
        newSet.delete(toolCallId);
      } else {
        newSet.add(toolCallId);
      }
      return newSet;
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  // 打开Word预览
  const handleOpenPreview = (filepath: string) => {
    setPreviewFile(filepath);
    setIsPreviewOpen(true);
  };

  // 关闭Word预览
  const handleClosePreview = () => {
    setIsPreviewOpen(false);
    setPreviewFile(null);
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="flex justify-start items-start w-full"
    >
      <div className="flex flex-col items-start space-y-2 w-full">
      {toolCalls.map((toolCall, index) => {
        const result = toolResults.find(r => r.toolCallId === toolCall.id);
        const isRunning = !result;
        const isSuccess = result?.success;
        const isError = result && !result.success;
        const isExpanded = expandedCalls.has(toolCall.id);

        return (
          <motion.div
            key={toolCall.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="rounded-xl overflow-hidden border w-full"
            style={{
              background: TERMINAL.bg,
              borderColor: TERMINAL.bgTertiary,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
            }}
            whileHover={{ y: -1 }}
          >
            {/* 主信息行 - 始终可见 */}
            <div
              className={`flex items-center gap-3 px-3 py-2.5 ${
                (isSuccess || isError) ? 'cursor-pointer hover:bg-[#24283b]/50' : ''
              }`}
              onClick={() => (isSuccess || isError) && toggleExpand(toolCall.id)}
            >
              {/* 状态图标 */}
              <div className="flex-shrink-0">
                {isRunning && (
                  <Loader2 size={14} className="animate-spin" style={{ color: TERMINAL.green }} />
                )}
                {isSuccess && (
                  <CheckCircle size={14} style={{ color: TERMINAL.green }} />
                )}
                {isError && (
                  <XCircle size={14} style={{ color: TERMINAL.pink }} />
                )}
              </div>

              {/* 工具名称 */}
              <div className="flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <span style={{ color: TERMINAL.green }} className="text-xs font-mono">$</span>
                  <span
                    className="text-xs font-medium font-mono"
                    style={{ color: TERMINAL.cyan }}
                  >
                    {getToolNameCN(toolCall.function.name)}
                  </span>
                </div>
              </div>

              {/* 参数预览 - 直接显示在右侧，超长省略 */}
              <div className="flex-1 min-w-0 overflow-hidden">
                <span
                  className="text-xs font-mono block truncate"
                  style={{ color: TERMINAL.textSecondary }}
                  title={toolCall.function.arguments}
                >
                  {toolCall.function.arguments}
                </span>
              </div>

              {/* 状态标签 */}
              <div className="flex-shrink-0">
                {isRunning && (
                  <span
                    className="text-xs font-mono animate-pulse"
                    style={{ color: TERMINAL.orange }}
                  >
                    ⏳ 执行中...
                  </span>
                )}
                {isSuccess && (
                  <span
                    className="text-xs font-mono"
                    style={{ color: TERMINAL.green }}
                  >
                    ✓ 完成
                  </span>
                )}
                {isError && (
                  <span
                    className="text-xs font-mono"
                    style={{ color: TERMINAL.pink }}
                  >
                    ✗ 失败
                  </span>
                )}
              </div>

              {/* 时间信息 */}
              {result && (
                <div
                  className="flex items-center gap-1 text-xs flex-shrink-0 font-mono"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  <Clock size={10} />
                  <span>{formatTime(Date.now())}</span>
                </div>
              )}

              {/* 展开/收起按钮 */}
              {(isSuccess || isError) && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(toolCall.id);
                  }}
                  className="flex-shrink-0 p-1 rounded transition-all hover:bg-[#24283b]"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>
              )}
            </div>

            {/* 展开的详情 */}
            <AnimatePresence>
              {isExpanded && result && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                  style={{ background: '#16161e' }}
                >
                  <div className="p-3 space-y-3">
                    {/* 截断信息提示 */}
                    {result.truncated && (
                      <div
                        className="p-2.5 rounded text-xs border font-mono"
                        style={{
                          background: 'rgba(255, 158, 100, 0.1)',
                          borderColor: 'rgba(255, 158, 100, 0.3)',
                          color: TERMINAL.orange,
                        }}
                      >
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="font-medium text-[10px] uppercase tracking-wide">
                            ⚠️ 输出过大 ({result.sizeFormatted})
                          </div>
                          {/* Word文档预览按钮 */}
                          {isWordFile(result.savedPath) && (
                            <button
                              onClick={() => result.savedPath && handleOpenPreview(result.savedPath)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-mono transition-all border"
                              style={{
                                background: TERMINAL.bgSecondary,
                                color: TERMINAL.cyan,
                                borderColor: TERMINAL.bgTertiary,
                              }}
                              whileHover={{ y: -1 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Eye size={10} />
                              预览编辑
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] break-all font-mono" style={{ color: TERMINAL.textSecondary }}>
                          完整输出已保存至: <span className="px-1 rounded" style={{
                            background: TERMINAL.bgSecondary,
                            color: TERMINAL.cyan
                          }}>{result.savedPath}</span>
                        </div>
                        <div className="text-[10px] mt-1 font-mono" style={{ color: TERMINAL.textSecondary }}>
                          📄 预览 (前 {result.displaySize} 字符):
                        </div>
                      </div>
                    )}

                    {/* 参数 */}
                    <div>
                      <div
                        className="text-[10px] font-medium mb-1.5 font-mono uppercase tracking-wide flex items-center gap-1"
                        style={{ color: TERMINAL.textSecondary }}
                      >
                        <Terminal size={10} />
                        调用参数
                      </div>
                      <pre
                        className="text-xs rounded border p-2.5 overflow-x-auto max-h-[120px] font-mono"
                        style={{
                          background: TERMINAL.bgSecondary,
                          borderColor: TERMINAL.bgTertiary,
                          color: TERMINAL.textPrimary,
                        }}
                      >
                        {toolCall.function.arguments}
                      </pre>
                    </div>

                    {/* 执行结果 */}
                    {result.result && (
                      <div>
                        <div
                          className="text-[10px] font-medium mb-1.5 font-mono uppercase tracking-wide flex items-center gap-1"
                          style={{ color: TERMINAL.textSecondary }}
                        >
                          <Terminal size={10} />
                          执行结果
                          {result.truncated && ' (预览)'}
                        </div>
                        <pre
                          className="text-xs rounded border p-2.5 overflow-x-auto max-h-[200px] font-mono"
                          style={{
                            background: TERMINAL.bgSecondary,
                            borderColor: TERMINAL.bgTertiary,
                            color: TERMINAL.textPrimary,
                          }}
                        >
                          {typeof result.result === 'string'
                            ? result.result
                            : JSON.stringify(result.result, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* 错误信息 */}
                    {result.error && (
                      <div
                        className="p-2.5 rounded border font-mono"
                        style={{
                          background: 'rgba(247, 118, 142, 0.1)',
                          borderColor: 'rgba(247, 118, 142, 0.3)',
                          color: TERMINAL.pink,
                        }}
                      >
                        <div className="text-[10px] font-medium mb-1 uppercase tracking-wide">✗ 执行错误</div>
                        <div className="text-[10px]">{result.error}</div>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
      </div>
    </motion.div>

    {/* Word预览对话框 */}
    {previewFile && (
      <WordPreviewDialog
        isOpen={isPreviewOpen}
        filepath={previewFile}
        onClose={handleClosePreview}
      />
    )}
  </>
);
};

export default ToolCallSimple;
