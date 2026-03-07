/**
 * Token 计数器 - Electron Main 进程版本
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
 * 从多模态内容中提取文本
 */
function extractTextFromContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((part: any) => part.type === 'text' && part.text)
      .map((part: any) => part.text)
      .join('\n');
  }
  return '';
}

/**
 * 计算消息数组的 token 数量
 */
export function countMessagesTokens(messages: any[]): number {
  let total = 0;
  for (const msg of messages) {
    const textContent = extractTextFromContent(msg.content);
    total += estimateTokens(textContent);
    // 计算元数据的 token 开销（role、tool_calls 等）
    total += 10;
    // 如果有图片，增加额外开销（每张图片约 85 tokens）
    if (Array.isArray(msg.content)) {
      const imageCount = msg.content.filter((part: any) => part.type === 'image_url').length;
      total += imageCount * 85;
    }
  }
  return total;
}

/**
 * 计算上下文总 token 数量
 */
export function countContextTokens(messages: any[], systemPrompt: string, tools: any[] = []): number {
  let total = 0;

  // 系统提示词
  total += estimateTokens(systemPrompt);

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
    const rawContent = extractTextFromContent(msg.content);
    const content = rawContent.slice(0, 100); // 限制每条消息最多 100 字符

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
export interface CompressionConfig {
  maxTokens: number;
  threshold: number;
  keepRecentMessages: number;
}

/**
 * 压缩上下文
 * 返回压缩后的消息数组和压缩的消息数量
 */
export function compressContext(
  messages: any[],
  config: CompressionConfig = {
    maxTokens: 128000,
    threshold: 0.85,
    keepRecentMessages: 20,
  }
): { compressedMessages: any[]; compressedCount: number; compressionOccurred: boolean } {
  // 分离系统消息和对话消息
  const systemMessages = messages.filter((m: any) => m.role === 'system');
  const conversationMessages = messages.filter((m: any) => m.role !== 'system');

  // 保留最近的消息
  const recentMessages = conversationMessages.slice(-config.keepRecentMessages);
  const oldMessages = conversationMessages.slice(0, -config.keepRecentMessages);

  // 如果没有旧消息需要压缩
  if (oldMessages.length === 0) {
    return { compressedMessages: messages, compressedCount: 0, compressionOccurred: false };
  }

  // 将旧消息压缩为摘要
  const summary = compressMessagesToSummary(oldMessages);

  // 创建压缩摘要消息
  const summaryMessage: any = {
    role: 'system',
    content: `【以下是对话历史的压缩摘要，已省略详细内容以节省上下文】\n${summary}\n\n【摘要结束】`,
  };

  // 组合新的消息列表：系统消息 + 压缩摘要 + 最近的消息
  const compressedMessages = [...systemMessages, summaryMessage, ...recentMessages];

  console.log(`[Context Compression] 压缩了 ${oldMessages.length} 条消息，保留 ${recentMessages.length} 条最近消息`);

  return {
    compressedMessages,
    compressedCount: oldMessages.length,
    compressionOccurred: true,
  };
}
