import { Message, ToolCall, ToolResult } from './index';

/**
 * 消息线程 - 一次完整的对话交互
 * 包含：用户提问 → 助手思考 → 工具调用 → 最终回答
 */
export interface MessageThread {
  id: string;
  userMessage: Message;
  assistantMessage?: Message;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  finalMessage?: Message;
  status: ThreadStatus;
  timestamp: number;
}

/**
 * 线程状态
 */
export type ThreadStatus = 'pending' | 'thinking' | 'using_tool' | 'completed';

/**
 * 消息类型标签
 */
export type MessageKind = 'user' | 'thinking' | 'executing' | 'result';

/**
 * 消息类型标签配置 - 终端风格
 */
export interface MessageKindConfig {
  label: string;
  bgColor: string;
  textColor: string;
  accentColor: string;
}

/**
 * 消息类型标签配置表 - 终端风格色彩体系
 */
export const KIND_CONFIGS: Record<MessageKind, MessageKindConfig> = {
  user: {
    label: 'user',
    bgColor: '#fff8f0',
    textColor: '#1a1b26',
    accentColor: '#9ece6a'
  },
  thinking: {
    label: 'thinking',
    bgColor: '#1a1b26',
    textColor: '#ff9e64',
    accentColor: '#ff9e64'
  },
  executing: {
    label: 'executing',
    bgColor: '#1a1b26',
    textColor: '#2ac3de',
    accentColor: '#2ac3de'
  },
  result: {
    label: 'assistant',
    bgColor: '#fff8f0',
    textColor: '#1a1b26',
    accentColor: '#7aa2f7'
  },
};

/**
 * 获取消息类型标签配置
 */
export function getKindConfig(kind: MessageKind): MessageKindConfig {
  return KIND_CONFIGS[kind];
}

/**
 * 工具名称中文映射
 */
export const TOOL_NAME_CN: Record<string, string> = {
  'readFile': '读取文件',
  'writeFile': '写入文件',
  'searchFiles': '搜索文件',
  'wordRead': '读取 Word 文档',
  'wordCreate': '创建 Word 文档',
  'wordEdit': '编辑 Word 文档',
  'wordAddHeader': '添加页眉',
  'wordAddFooter': '添加页脚',
  'listFiles': '列出文件',
  'createDirectory': '创建目录',
  'deleteFile': '删除文件',
  'copyFile': '复制文件',
  'moveFile': '移动文件',
};

/**
 * 获取工具中文名称
 */
export function getToolNameCN(name: string): string {
  return TOOL_NAME_CN[name] || name;
}
