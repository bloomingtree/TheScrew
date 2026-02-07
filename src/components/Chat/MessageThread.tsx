import React from 'react';
import { motion } from 'framer-motion';
import { MessageThread as MessageThreadType } from '../../types/thread';
import ThreadCard from './ThreadCard';
import ToolCallSimple from './ToolCallSimple';
import { useChatStore } from '../../store/chatStore';

interface MessageThreadProps {
  thread: MessageThreadType;
  messageIndexStart: number;
  prevThread?: MessageThreadType | null;
}

const MessageThread: React.FC<MessageThreadProps> = ({ thread, messageIndexStart, prevThread }) => {
  const { toolResults } = useChatStore();

  // 获取消息在线程中的实际索引
  const getMessageIndex = (): number => {
    // 这里需要根据实际的消息在全局数组中的位置来计算
    // 暂时简化处理，使用传入的起始索引
    return messageIndexStart;
  };

  // 从 chatStore 获取与此线程相关的工具结果
  const getThreadToolResults = () => {
    if (!thread.toolCalls || thread.toolCalls.length === 0) return [];
    const toolCallIds = thread.toolCalls.map(tc => tc.id);
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

  // 判断是否显示用户消息的时间戳
  // 规则：如果前一个线程有最终回答（AI消息），或者这是第一个线程，则显示时间戳
  const showUserTimestamp = !prevThread || !!prevThread.finalMessage;

  // 判断是否显示最终回答的时间戳（始终显示）
  const showFinalTimestamp = true;

  // 判断是否显示思考消息的时间戳（始终显示）
  const showThinkingTimestamp = true;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="py-3"
    >
      {/* 消息卡片容器 */}
      <div className="space-y-2">
        {/* 用户消息 */}
        <ThreadCard
          message={thread.userMessage}
          kind="user"
          index={getMessageIndex()}
          threadId={thread.id}
          showTimestamp={showUserTimestamp}
        />

        {/* 助手思考消息 */}
        {thread.assistantMessage && (
          <ThreadCard
            message={thread.assistantMessage}
            kind="thinking"
            index={getMessageIndex()}
            threadId={thread.id}
            showTimestamp={showThinkingTimestamp}
          />
        )}

        {/* 工具调用 */}
        {thread.toolCalls && thread.toolCalls.length > 0 && (
          <ToolCallSimple
            toolCalls={thread.toolCalls}
            toolResults={getThreadToolResults()}
            status={getToolStatus()}
          />
        )}

        {/* 最终回答 */}
        {thread.finalMessage && (
          <ThreadCard
            message={thread.finalMessage}
            kind="result"
            index={getMessageIndex()}
            threadId={thread.id}
            toolResults={getThreadToolResults()}
            showTimestamp={showFinalTimestamp}
          />
        )}
      </div>
    </motion.div>
  );
};

export default MessageThread;
