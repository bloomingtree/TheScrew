/**
 * 模板类型定义
 */

// 模板类型枚举
export enum TemplateType {
  WORD_DOCUMENT = 'word_document',      // Word 文档模板
  PROMPT = 'prompt',                     // 提示词模板
  ASSISTANT = 'assistant'                // 助手工具
}

// Word 文档样式配置
export interface WordStyleConfig {
  // 字体设置
  fontFamily?: string;
  fontSize?: number;          // 半字号单位，如24表示12pt
  bold?: boolean;
  italic?: boolean;

  // 段落设置
  alignment?: 'left' | 'center' | 'right' | 'justify';
  lineSpacing?: number;       // 行间距（缇）
  spacingBefore?: number;     // 段前间距（缇）
  spacingAfter?: number;      // 段后间距（缇）
  firstLineIndent?: number;   // 首行缩进（缇）

  // 颜色
  color?: string;             // 十六进制颜色
}

// 模板占位符配置
export interface TemplatePlaceholder {
  name: string;               // 占位符名称，如 {{title}}
  displayName: string;        // 显示名称
  description?: string;       // 描述信息
  type: 'text' | 'date' | 'number' | 'select' | 'textarea';
  defaultValue?: string;      // 默认值
  required?: boolean;         // 是否必填
  options?: string[];         // 当 type 为 select 时的选项
}

// Word 文档模板结构
export interface WordDocumentTemplate {
  id: string;
  name: string;               // 模板名称
  description: string;        // 模板描述
  category: string;           // 分类：工作报告、值班记录等
  type: TemplateType.WORD_DOCUMENT;
  isBuiltIn?: boolean;        // 是否为内置模板

  // 模板文件
  templateFile: string;       // 模板文件路径（相对于 templates 目录）

  // 样式配置
  styles: {
    title?: WordStyleConfig;  // 标题样式
    heading1?: WordStyleConfig;
    heading2?: WordStyleConfig;
    heading3?: WordStyleConfig;
    normal?: WordStyleConfig; // 正文样式
  };

  // 占位符定义
  placeholders: TemplatePlaceholder[];

  // 页眉页脚配置
  header?: {
    text?: string;
    align?: 'left' | 'center' | 'right';
  };
  footer?: {
    text?: string;
    align?: 'left' | 'center' | 'right';
    showPageNumber?: boolean;
  };

  // 页面设置
  pageSettings?: {
    margin?: {
      top?: number;
      bottom?: number;
      left?: number;
      right?: number;
    };
  };

  // 元数据
  createdAt: number;
  updatedAt: number;
  tags?: string[];            // 标签
  preview?: string;           // 预览图路径
}

// 提示词模板
export interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  type: TemplateType.PROMPT;
  isBuiltIn?: boolean;        // 是否为内置模板

  // 提示词内容
  content: string;            // 支持占位符

  // 占位符定义
  placeholders: TemplatePlaceholder[];

  // 预设参数
  presetValues?: Record<string, string>;

  // 关联的助手（可选）
  linkedAssistantId?: string;

  createdAt: number;
  updatedAt: number;
  tags?: string[];
}

// 助手工具
export interface AssistantTool {
  id: string;
  name: string;
  description: string;
  category: string;
  type: TemplateType.ASSISTANT;
  isBuiltIn?: boolean;        // 是否为内置模板

  // 助手配置
  systemPrompt: string;       // 系统 Prompt
  promptTemplateId?: string;  // 关联的提示词模板

  // 输入配置
  inputs: TemplatePlaceholder[];

  // 输出配置
  outputFormat?: 'text' | 'markdown' | 'word';
  outputTemplateId?: string;  // 输出使用的 Word 模板

  // 多轮对话配置
  enableMultiTurn: boolean;
  maxTurns?: number;

  createdAt: number;
  updatedAt: number;
  tags?: string[];
  icon?: string;              // 图标名称
}

// 通用模板联合类型
export type Template = WordDocumentTemplate | PromptTemplate | AssistantTool;

// 模板使用记录
export interface TemplateUsage {
  id: string;
  templateId: string;
  templateType: TemplateType;
  conversationId?: string;
  usedAt: number;
  parameters: Record<string, any>;
  resultPath?: string;        // 生成文件的路径
}

// 模板使用参数
export interface UseTemplateParams {
  templateId: string;
  parameters: Record<string, any>;
  outputPath?: string;
  conversationId?: string;
}

// 文档转换参数
export interface ConvertDocumentParams {
  sourceFile: string;
  templateId: string;
  outputPath?: string;
}

// 助手执行参数
export interface UseAssistantParams {
  assistantId: string;
  input: string;
  context?: string;
  conversationId?: string;
}

// 助手执行结果
export interface AssistantResult {
  content: string;
  turnCount: number;
  isComplete: boolean;
  outputFilePath?: string;
}
