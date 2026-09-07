import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Wrench, Brain, ChevronDown } from 'lucide-react';
import { useChatStore } from '../../store/chatStore';
import { useConversationStore } from '../../store/conversationStore';
import UserMessage from './messages/UserMessage';
import AssistantMessage from './messages/AssistantMessage';

/** 流式状态指示器：思考中 / 工具调用中 —— 醒目可见 */
const StreamingStatusBar: React.FC = () => {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const toolResults = useChatStore((s) => s.toolResults);
  const toolCallWritingMap = useChatStore((s) => s.toolCallWritingMap);
  if (!isStreaming) return null;

  const lastMsg = messages[messages.length - 1];
  if (!lastMsg || lastMsg.role !== 'assistant') return null;

  // LLM 写参数阶段：toolCallWritingMap 中存在 status='writing' 的条目
  const writingEntries = Array.from(toolCallWritingMap.values()).filter(
    (e: any) => e?.status === 'writing'
  );
  const isToolWriting = writingEntries.length > 0;

  // 判断当前阶段
  const hasToolCalls = lastMsg.tool_calls && lastMsg.tool_calls.length > 0;
  const completedToolIds = new Set(toolResults.map((r: any) => r.toolCallId));
  const pendingTools = hasToolCalls
    ? lastMsg.tool_calls.filter((tc: any) => !completedToolIds.has(tc.id))
    : [];
  const isToolRunning = pendingTools.length > 0;
  const hasContent = !!lastMsg.content;
  const hasThinking = !!lastMsg.thinkingContent;

  // 工具名称 → 中文友好名映射（写参数与执行中共用）
  const labelMap: Record<string, string> = {
    office_create: '创建文档',
    office_set: '修改文档',
    office_add: '添加内容',
    office_remove: '删除内容',
    office_view: '读取文档',
    office_get: '查询属性',
    office_batch: '批量操作',
    office_merge: '合并数据',
    office_apply_style: '应用样式',
    edit: '编辑文件',
    ls: '列出目录',
    write: '写入文件',
    read: '读取文件',
    edit_file: '编辑文件', // 以下为旧工具名兼容映射（历史会话）
    list_directory: '列出目录',
    write_file: '写入文件',
    read_file: '读取文件',
    execute_command: '执行命令',
    web_search: '搜索网络',
    ask_user: '等待回复',
    task_create: '创建任务',
    task_list: '列出任务',
    task_update: '更新任务',
    task_complete: '完成任务',
  };

  // 阶段判定优先级：工具写参数 > 工具执行 > 思考 > 正文输出 > 等待响应
  let phase: 'tool' | 'thinking' | 'waiting';
  let label: string;
  let color: string;
  let bgColor: string;
  let borderColor: string;

  if (isToolWriting) {
    phase = 'tool';
    const firstName = writingEntries[0]?.name || '';
    const friendlyName = labelMap[firstName] || firstName || '工具调用';
    label = writingEntries.length > 1
      ? `正在准备 ${writingEntries.length} 个工具调用（${friendlyName}…）`
      : `正在调用工具：${friendlyName}`;
    color = '#c2410c';
    bgColor = '#fff7ed';
    borderColor = '#fb923c';
  } else if (isToolRunning) {
    phase = 'tool';
    const firstName = pendingTools[0]?.function?.name || '';
    const friendlyName = labelMap[firstName] || firstName || '工具调用';
    label = pendingTools.length > 1
      ? `正在调用 ${pendingTools.length} 个工具（${friendlyName}…）`
      : `正在调用工具：${friendlyName}`;
    color = '#c2410c';
    bgColor = '#fff7ed';
    borderColor = '#fb923c';
  } else if (hasThinking && !hasContent) {
    phase = 'thinking';
    label = '正在思考…';
    color = '#6b21a8';
    bgColor = '#faf5ff';
    borderColor = '#c084fc';
  } else if (hasContent) {
    // 正在输出正文
    return null;
  } else {
    phase = 'waiting';
    label = '等待响应…';
    color = '#374151';
    bgColor = '#f3f4f6';
    borderColor = '#d1d5db';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.25 }}
      className="flex justify-center px-4 py-3"
    >
      <div
        className="flex items-center gap-2.5 px-4 py-2 rounded-full shadow-sm border"
        style={{ backgroundColor: bgColor, borderColor, color }}
      >
        {phase === 'tool' ? (
          <Loader2 size={16} className="animate-spin" style={{ color }} />
        ) : phase === 'thinking' ? (
          <Brain size={16} className="animate-pulse" style={{ color }} />
        ) : (
          <motion.div
            animate={{ scale: [1, 1.3, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="text-sm font-medium">{label}</span>
        {phase === 'tool' && (
          <motion.span
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity }}
            className="text-xs"
          >
            ···
          </motion.span>
        )}
      </div>
    </motion.div>
  );
};

interface MessageListProps {}

const MessageList: React.FC<MessageListProps> = () => {
  // 精确订阅：避免 toolCallWritingMap 等高频状态变化触发消息列表全量重渲染
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const currentConversationId = useConversationStore((s) => s.currentConversationId);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 是否钉在底部（用户未上滑离开）
  const isPinnedRef = useRef(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  // 流结束时用户不在底部 → 显示"新回复"提示
  const [hasNewReply, setHasNewReply] = useState(false);
  const wasStreamingRef = useRef(false);

  /** 距底部阈值（px）：小于该值视为"在底部" */
  const BOTTOM_THRESHOLD = 48;

  const isNearBottom = (el: HTMLDivElement): boolean =>
    el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pinned = isNearBottom(el);
    isPinnedRef.current = pinned;
    // 内容不足一屏时不显示回底按钮
    setShowJumpButton(!pinned && el.scrollHeight > el.clientHeight);
    if (pinned) setHasNewReply(false);
  }, []);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    isPinnedRef.current = true;
    setHasNewReply(false);
    setShowJumpButton(false);
  }, []);

  // 消息/流式状态更新：钉住时瞬时置底（无平滑动画，避免"从上方滑下来"的不自然感）
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const last = messages[messages.length - 1];
    // 用户发送新消息 → 强制回到底部
    if (last?.role === 'user') {
      isPinnedRef.current = true;
      setHasNewReply(false);
    }
    if (isPinnedRef.current) {
      // 直接赋值 scrollTop，内容增长时始终贴底（OpenWebUI 风格）
      el.scrollTop = el.scrollHeight;
      setShowJumpButton(false);
    }
  }, [messages, isStreaming]);

  // 流式结束：若用户当时不在底部，显示新回复提示（配合右下角按钮）
  useEffect(() => {
    if (wasStreamingRef.current && !isStreaming && !isPinnedRef.current) {
      setHasNewReply(true);
      setShowJumpButton(true);
    }
    wasStreamingRef.current = isStreaming;
  }, [isStreaming]);

  // 切换对话：回到底部
  useEffect(() => {
    isPinnedRef.current = true;
    setHasNewReply(false);
    // 等待消息渲染完成后再置底
    requestAnimationFrame(() => scrollToBottom());
  }, [currentConversationId, scrollToBottom]);

  // 简单的顺序渲染：每条消息独立渲染
  const renderMessage = (message: any, index: number) => {
    // user 消息
    if (message.role === 'user') {
      return (
        <UserMessage
          key={`msg-${index}`}
          message={message}
        />
      );
    }

    // assistant 消息
    if (message.role === 'assistant') {
      return (
        <AssistantMessage
          key={`msg-${index}`}
          message={message}
        />
      );
    }

    // tool 消息（不直接渲染，工具调用通过 AssistantMessage 的 tool_calls 显示）
    return null;
  };

  return (
    <div className="relative h-full">
      {/* 滚动容器 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto"
      >
        {/* 居中布局容器 */}
        <div className="max-w-[1600px] mx-auto min-h-full">
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="flex flex-col items-center pt-[20%]"
            >
              <img src="./logo.png" alt="螺丝帽" className="w-16 h-16 rounded-2xl mb-4 shadow-md" />
              <p className="text-2xl font-semibold mb-2 text-[#374151]">我是螺丝帽，有什么可以帮助您？</p>
              <p className="text-sm text-[#9CA3AF]">今天是{new Date().toLocaleDateString('zh-CN', { weekday: 'long' })}</p>
            </motion.div>
          )}

          {/* 顺序渲染每条消息 */}
          {messages.map((message, index) => renderMessage(message, index))}

          {/* 流式状态指示器：思考/工具调用/等待 —— 取代之前只对空消息显示的跳点 */}
          <StreamingStatusBar />

          <div className="h-5" />
        </div>
      </div>

      {/* 右下角回底按钮：用户上滑离开底部后出现；流结束时带"新回复"提示 */}
      <AnimatePresence>
        {showJumpButton && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.2 }}
            onClick={() => scrollToBottom(true)}
            className={`absolute bottom-4 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-full
              text-xs font-medium shadow-md border transition-colors z-10
              ${hasNewReply
                ? 'bg-primary-blue text-white border-primary-blue hover:shadow-lg'
                : 'bg-white text-primary-blue border-gray-200 hover:border-primary-blue/40'
              }`}
            title={hasNewReply ? '查看新回复' : '回到底部'}
          >
            <ChevronDown size={14} />
            {hasNewReply ? '查看新回复' : '回到底部'}
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MessageList;
