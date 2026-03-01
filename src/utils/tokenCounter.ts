/**
 * Token 计数器
 * 用于估算文本的 token 数量
 */

// 粗略估算：英文约 4 字符/token，中文约 2 字符/token
export function estimateTokens(text: string): number {
  if (!text) return 0;

  let chineseChars = 0;
  let englishChars = 0;

  for (const char of text) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      chineseChars++;
    } else if (/[a-zA-Z0-9]/.test(char)) {
      englishChars++;
    }
  }

  // 中文：约 0.5 token/字符
  // 英文：约 0.25 token/字符
  return Math.ceil(chineseChars * 0.5 + englishChars * 0.25);
}

/**
 * 计算消息数组的 token 数量
 */
export function countMessagesTokens(messages: any[]): number {
  let total = 0;
  for (const msg of messages) {
    total += estimateTokens(msg.content || '');
    // 计算元数据的 token 开销（role、tool_calls 等）
    total += 10;
  }
  return total;
}

/**
 * 估算系统提示词的 token 数量
 */
export function countSystemPromptTokens(systemPrompt: string): number {
  return estimateTokens(systemPrompt);
}

/**
 * 计算上下文总 token 数量
 */
export function countContextTokens(messages: any[], systemPrompt: string, tools: any[] = []): number {
  let total = 0;

  // 系统提示词
  total += countSystemPromptTokens(systemPrompt);

  // 对话消息
  total += countMessagesTokens(messages);

  // 工具定义（每个工具约 100-200 tokens）
  if (tools && tools.length > 0) {
    total += tools.length * 150;
  }

  // 预留一些 buffer
  total += 500;

  return total;
}

/**
 * 压缩上下文摘要
 * 将多条旧消息合并为一条摘要
 */
export function compressMessagesToSummary(messages: any[]): string {
  const summary: string[] = [];

  for (const msg of messages) {
    const role = msg.role === 'user' ? '用户' : msg.role === 'assistant' ? '助手' : '工具';
    const content = (msg.content || '').slice(0, 100); // 限制每条消息最多 100 字符

    if (msg.tool_calls) {
      summary.push(`${role}调用了工具: ${msg.tool_calls.map((tc: any) => tc.function.name).join(', ')}`);
    } else if (msg.role === 'tool') {
      // 跳过工具结果消息
      continue;
    } else if (content) {
      summary.push(`${role}: ${content}${content.length >= 100 ? '...' : ''}`);
    }
  }

  return summary.join('\n');
}

/**
 * 上下文压缩配置
 */
interface CompressionConfig {
  maxTokens: number;           // 最大 token 限制
  threshold: number;           // 触发压缩的阈值（0-1）
  keepRecentMessages: number;  // 保留最近的消息数量
}

/**
 * 压缩上下文
 * 当 token 数量接近上限时，将旧消息压缩为摘要
 */
export function compressContext(
  messages: any[],
  systemPrompt: string,
  tools: any[] = [],
  config: CompressionConfig = {
    maxTokens: 128000,
    threshold: 0.85,      // 85% 时触发压缩
    keepRecentMessages: 20, // 保留最近 20 条消息
  }
): { compressedMessages: any[]; compressedCount: number } {
  const currentTokens = countContextTokens(messages, systemPrompt, tools);
  const thresholdTokens = config.maxTokens * config.threshold;

  // 如果未达到阈值，不压缩
  if (currentTokens < thresholdTokens) {
    return { compressedMessages: messages, compressedCount: 0 };
  }

  // 分离系统消息和对话消息
  const systemMessages = messages.filter((m: any) => m.role === 'system');
  const conversationMessages = messages.filter((m: any) => m.role !== 'system');

  // 保留最近的消息
  const recentMessages = conversationMessages.slice(-config.keepRecentMessages);
  const oldMessages = conversationMessages.slice(0, -config.keepRecentMessages);

  // 如果没有旧消息需要压缩
  if (oldMessages.length === 0) {
    return { compressedMessages: messages, compressedCount: 0 };
  }

  // 将旧消息压缩为摘要
  const summary = compressMessagesToSummary(oldMessages);

  // 创建压缩摘要消息
  const summaryMessage: any = {
    role: 'system',
    content: `【以下是对话历史的压缩摘要，已省略详细内容】\n${summary}\n\n【摘要结束】`,
  };

  // 组合新的消息列表：系统消息 + 压缩摘要 + 最近的消息
  const compressedMessages = [...systemMessages, summaryMessage, ...recentMessages];

  console.log(`[Context Compression] 压缩了 ${oldMessages.length} 条消息，保留 ${recentMessages.length} 条最近消息`);

  return {
    compressedMessages,
    compressedCount: oldMessages.length,
  };
}

/**
 * 智能上下文管理
 * 根据消息重要性决定保留哪些消息
 */
export function smartContextManagement(
  messages: any[],
  systemPrompt: string,
  tools: any[] = [],
  config: CompressionConfig = {
    maxTokens: 128000,
    threshold: 0.85,
    keepRecentMessages: 20,
  }
): { messages: any[]; compressedCount: number } {
  // 首先尝试简单的上下文压缩
  const result = compressContext(messages, systemPrompt, tools, config);

  // 如果压缩后仍然超过限制，进行更激进的压缩
  const compressedTokens = countContextTokens(result.compressedMessages, systemPrompt, tools);
  if (compressedTokens > config.maxTokens * 0.9) {
    // 移除工具结果消息（这些通常占用大量空间）
    const messagesWithoutToolResults = result.compressedMessages.filter(
      (m: any) => m.role !== 'tool'
    );

    return {
      messages: messagesWithoutToolResults,
      compressedCount: result.compressedCount + result.compressedMessages.length - messagesWithoutToolResults.length,
    };
  }

  return {
    messages: result.compressedMessages,
    compressedCount: result.compressedCount,
  };
}
