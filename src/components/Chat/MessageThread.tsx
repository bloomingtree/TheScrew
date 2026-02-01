import React from 'react';
import { motion } from 'framer-motion';
import { MessageThread as MessageThreadType } from '../../types/thread';
import ThreadCard from './ThreadCard';
import ToolCallSimple from './ToolCallSimple';
import { useChatStore } from '../../store/chatStore';

interface MessageThreadProps {
  thread: MessageThreadType;
  messageIndexStart: number;
}

const MessageThread: React.FC<MessageThreadProps> = ({ thread, messageIndexStart }) => {
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="relative pl-6 py-4"
    >
      {/* 左侧垂直引导线 */}
      <div className="absolute left-0 top-2 bottom-2 w-[2px] bg-[#E0E0E0]" />

      {/* 消息卡片容器 */}
      <div className="space-y-3">
        {/* 用户消息 */}
        <ThreadCard
          message={thread.userMessage}
          kind="user"
          index={getMessageIndex()}
          threadId={thread.id}
        />

        {/* 助手思考消息 */}
        {thread.assistantMessage && (
          <ThreadCard
            message={thread.assistantMessage}
            kind="thinking"
            index={getMessageIndex()}
            threadId={thread.id}
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
          />
        )}
      </div>
    </motion.div>
  );
};

export default MessageThread;
