/**
 * Twemoji 工具函数
 * 用于在不支持原生 emoji 的系统（如 Windows 7）上显示 emoji
 */

import twemoji from 'twemoji';

/**
 * 将文本中的 emoji 转换为 twemoji 图片
 * @param text 包含 emoji 的文本
 * @returns HTML 字符串，emoji 已被替换为 <img> 标签
 */
export function parseEmoji(text: string): string {
  return twemoji.parse(text, {
    folder: 'svg',
    ext: '.svg',
    className: 'twemoji',
    attributes: () => ({
      loading: 'lazy',
      draggable: 'false',
    }),
  });
}

/**
 * React 组件：渲染带有 twemoji 的文本
 */
export interface TwemojiTextProps {
  text: string;
  className?: string;
}

/**
 * 检查系统是否需要 twemoji 回退
 * Windows 7、旧版 Linux 等系统不支持完整 emoji
 */
export function needsTwemoji(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent;

  // Windows 7 检测
  if (ua.includes('Windows NT 6.1')) return true;

  // 可以通过实际渲染测试来判断
  // 但为了简化，我们默认对所有系统启用 twemoji
  // 因为 twemoji 在支持的系统上也能正常工作
  return true;
}

/**
 * CSS 样式用于 twemoji 图片
 */
export const twemojiStyle = `
  .twemoji {
    display: inline-block;
    vertical-align: text-bottom;
    width: 1.2em;
    height: 1.2em;
    margin: 0 0.05em;
  }
`;
