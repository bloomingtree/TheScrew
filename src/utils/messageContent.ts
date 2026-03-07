/**
 * 消息内容处理工具
 * 用于处理多模态消息内容（可能是字符串或数组格式）
 */

// 多模态内容部分类型
interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
}

// 消息内容类型（可能是字符串或多模态数组）
export type MessageContent = string | ContentPart[];

/**
 * 从消息内容中提取纯文本
 * @param content 消息内容（可能是字符串或多模态数组）
 * @returns 纯文本字符串
 */
export function extractTextFromContent(content: MessageContent): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(part => part.type === 'text' && part.text)
      .map(part => part.text)
      .join('\n');
  }
  return '';
}

/**
 * 检查消息内容是否有实际文本
 * @param content 消息内容
 * @returns 是否有文本内容
 */
export function hasTextContent(content: MessageContent): boolean {
  const text = extractTextFromContent(content);
  return text.trim().length > 0;
}

/**
 * 从消息内容中提取图片 URL 列表
 * @param content 消息内容
 * @returns 图片 URL 数组
 */
export function extractImageUrlsFromContent(content: MessageContent): string[] {
  if (!content || typeof content === 'string') return [];
  return content
    .filter(part => part.type === 'image_url' && part.image_url?.url)
    .map(part => part.image_url!.url);
}
