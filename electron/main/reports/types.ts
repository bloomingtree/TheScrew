/**
 * Report Types - 工作总结报告类型定义
 *
 * 报告生成模块的核心类型定义
 */

/**
 * 报告模板
 */
export interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  category: 'daily' | 'weekly' | 'monthly' | 'custom';
  content: string;           // Markdown 模板内容
  variables: string[];       // 可用变量列表
  createdAt: number;
  updatedAt: number;
}

/**
 * 日期范围
 */
export interface DateRange {
  start: Date;
  end: Date;
}

/**
 * 报告生成选项
 */
export interface ReportGenerationOptions {
  templateId: string;
  dateRange: DateRange;
  includeMemory: boolean;
  includeConversations: boolean;
  includeTasks: boolean;
  customData?: Record<string, any>;
}

/**
 * 生成的报告
 */
export interface GeneratedReport {
  id: string;
  templateId: string;
  title: string;
  content: string;           // Markdown 格式
  format: 'markdown';
  metadata: {
    generatedAt: number;
    dateRange: { start: number; end: number };
    dataPoints: number;
  };
}

/**
 * 报告导出选项
 */
export interface ReportExportOptions {
  format: 'markdown' | 'html' | 'docx';
  outputPath?: string;
  includeTimestamp: boolean;
}

/**
 * 报告数据源
 */
export interface ReportDataSource {
  notes: Map<string, string>;    // 日期 -> 笔记内容
  conversations: number;          // 对话数量
  tasks: number;                  // 完成任务数量
  dateRange: DateRange;
}

/**
 * 模板变量数据
 * 使用索引签名允许任意属性，所有属性都是可选的
 */
export interface TemplateVariables {
  [key: string]: string | number | boolean | undefined;
}

/**
 * 报告存储项
 */
export interface StoredReport {
  id: string;
  title: string;
  content: string;
  templateId: string;
  dateRange: { start: number; end: number };
  createdAt: number;
}
