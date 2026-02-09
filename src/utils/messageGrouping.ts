import { Message } from '../types';
import { MessageThread, MessageKind } from '../types/thread';

/**
 * 将消息列表分组为消息线程
 *
 * 分组规则：
 * 1. user 消息 → 新建线程，status='pending'
 * 2. assistant 消息（带 toolCalls）→ 添加到当前线程，status='thinking'
 * 3. tool 消息 → 添加到当前线程，status='using_tool'
 * 4. assistant 消息（无 toolCalls）→ 最终回答，status='completed'
 */
export function groupMessages(messages: Message[]): MessageThread[] {
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
        id: `thread-${message.id}`,
        userMessage: message,
        status: 'pending',
        timestamp: message.timestamp,
      };
    }
    // 助手消息（带工具调用但内容为空）- 思考阶段
    else if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0 && !message.content) {
      if (currentThread) {
        currentThread.assistantMessage = message;
        // 追加工具调用而不是替换
        if (!currentThread.toolCalls) {
          currentThread.toolCalls = [];
        }
        currentThread.toolCalls.push(...message.toolCalls);
        currentThread.status = 'thinking';
      }
    }
    // 工具消息 - 执行阶段
    else if (message.role === 'tool') {
      if (currentThread) {
        currentThread.status = 'using_tool';
      }
    }
    // 助手消息（有内容）- 最终回答
    // 注意：工具调用完成后，流式输出会给原消息添加 content，此时应作为最终回答
    else if (message.role === 'assistant' && message.content) {
      if (currentThread) {
        // 如果这条消息有 toolCalls，追加到现有列表
        if (message.toolCalls && message.toolCalls.length > 0) {
          if (!currentThread.toolCalls) {
            currentThread.toolCalls = [];
          }
          currentThread.toolCalls.push(...message.toolCalls);
        }
        currentThread.finalMessage = message;
        currentThread.status = 'completed';
        threads.push(currentThread);
        currentThread = null;
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
export function getMessageKind(message: Message, thread: MessageThread): MessageKind {
  if (message.role === 'user') {
    return 'user';
  }

  if (message.id === thread.assistantMessage?.id) {
    return 'thinking';
  }

  if (message.id === thread.finalMessage?.id) {
    return 'result';
  }

  return 'thinking'; // 默认
}

/**
 * 获取线程的显示状态
 */
export function getThreadDisplayStatus(thread: MessageThread): MessageKind {
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
