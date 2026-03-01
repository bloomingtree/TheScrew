import { Message } from '../types';
import { MessageThread } from '../types/thread';

/**
 * 将消息列表分组为消息线程（简化版）
 *
 * 处理后端返回的消息格式：
 * - user: 用户消息
 * - assistant: AI 消息（可能包含 tool_calls）
 * - tool: 工具结果消息（包含 tool_call_id）
 */
export function groupMessages(messages: any[]): MessageThread[] {
  const threads: MessageThread[] = [];
  let currentThread: MessageThread | null = null;

  for (const message of messages) {
    // 用户消息 - 开始新线程
    if (message.role === 'user') {
      // 完成上一个线程
      if (currentThread) {
        threads.push(currentThread);
      }

      currentThread = {
        id: `thread-${message.id || Date.now()}`,
        userMessage: message,
        status: 'pending',
        timestamp: message.timestamp || Date.now(),
      };
    }
    // tool 消息 - 跳过（不单独处理，只用于状态标记）
    else if (message.role === 'tool') {
      if (currentThread) {
        currentThread.status = 'using_tool';
      }
    }
    // assistant 消息 - 添加到当前线程
    else if (message.role === 'assistant') {
      if (currentThread) {
        // 如果有 tool_calls，添加到线程
        if (message.tool_calls && message.tool_calls.length > 0) {
          const existingIds = new Set(currentThread.toolCalls?.map((tc: any) => tc.id) || []);
          const newCalls = message.tool_calls.filter((tc: any) => !existingIds.has(tc.id));
          currentThread.toolCalls = [...(currentThread.toolCalls || []), ...newCalls];
        }

        // 如果有内容，标记为最终回答
        if (message.content) {
          currentThread.finalMessage = message;
          currentThread.status = 'completed';
        } else if (message.tool_calls && message.tool_calls.length > 0) {
          // 有工具调用但没内容，设置为思考中
          currentThread.assistantMessage = message;
        }
      }
    }
  }

  // 添加最后一个未完成的线程
  if (currentThread) {
    threads.push(currentThread);
  }

  return threads;
}

/**
 * 获取消息在线程中的类型
 */
export function getMessageKind(message: Message, thread: MessageThread): any {
  if (message.role === 'user') {
    return 'user';
  }

  if (message.id === thread.assistantMessage?.id) {
    return 'thinking';
  }

  if (message.id === thread.finalMessage?.id) {
    return 'result';
  }

  return 'thinking';
}

/**
 * 获取线程的显示状态
 */
export function getThreadDisplayStatus(thread: MessageThread): any {
  switch (thread.status) {
    case 'pending':
      return 'user';
    case 'thinking':
      return 'thinking';
    case 'using_tool':
      return 'executing';
    case 'completed':
      return 'result';
    default:
      return 'user';
  }
}
