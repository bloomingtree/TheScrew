export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: number;
  images?: string[];
  attachments?: Attachment[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  success: boolean;
  result?: any;
  error?: string;
  // 截断元数据
  truncated?: boolean;
  originalSize?: number;
  displaySize?: number;
  sizeFormatted?: string;
  savedPath?: string;
}

export interface ToolExecution {
  toolCallId: string;
  name: string;
  arguments: string;
  description?: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface Config {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * 单个模型配置
 */
export interface ModelConfig {
  /** 配置唯一 ID */
  id: string;
  /** 配置名称（用于显示） */
  name: string;
  /** API 密钥 */
  apiKey: string;
  /** API 基础地址 */
  baseUrl: string;
  /** 模型名称 */
  model: string;
  /** 温度参数 */
  temperature: number;
  /** 最大令牌数 */
  maxTokens: number;
  /** 是否为默认配置 */
  isDefault?: boolean;
  /** 创建时间 */
  createdAt?: number;
  /** 更新时间 */
  updatedAt?: number;
}

/**
 * 多模型配置集合
 */
export interface ModelConfigs {
  /** 所有配置列表 */
  configs: ModelConfig[];
  /** 当前激活的配置 ID */
  activeConfigId: string;
}

export interface FileUpload {
  file: File;
  preview: string;
}

/**
 * 附件元数据类型
 * 用于表示用户上传的文件附件
 */
export interface Attachment {
  /** 附件唯一 ID */
  id: string;
  /** 所属消息 ID */
  messageId: string;
  /** 原始文件名 */
  fileName: string;
  /** 文件类型分类 */
  fileType: 'image' | 'document' | 'archive' | 'data' | 'unknown';
  /** MIME 类型 */
  mimeType: string;
  /** 文件大小（字节） */
  fileSize: number;
  /** SHA256 校验和（用于去重） */
  checksum: string;
  /** 存储策略：embedded=内嵌消息中，external=外部存储 */
  storageType: 'embedded' | 'external';
  /** 外部存储路径（相对于 workspace 或绝对路径） */
  storagePath?: string;
  /** 提取的内容（如果已提取） */
  extractedContent?: {
    /** 完整文本内容 */
    text?: string;
    /** 预览片段（前 1000 字符） */
    preview?: string;
    /** 页数（用于文档） */
    pageCount?: number;
    /** 工作表数（用于 Excel） */
    sheetCount?: number;
  };
  /** 创建时间戳 */
  createdAt: number;
  /** 处理状态 */
  status: 'pending' | 'processing' | 'ready' | 'error';
  /** 错误信息（如果 status 为 error） */
  error?: string;
}
