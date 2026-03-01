/**
 * Reports Module - 工作总结报告模块
 *
 * 导出报告模块的所有公共接口
 */

export * from './types';
export { TemplateEngine, getTemplateEngine, resetTemplateEngine } from './TemplateEngine';
export { ReportGenerator, getReportGenerator, resetReportGenerator } from './ReportGenerator';

// 类型重新导出（保持兼容性）
export type {
  ReportTemplate,
  DateRange,
  ReportGenerationOptions,
  GeneratedReport,
  ReportExportOptions,
  ReportDataSource,
  TemplateVariables,
  StoredReport,
} from './types';
