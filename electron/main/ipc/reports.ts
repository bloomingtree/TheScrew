/**
 * Reports IPC Handlers
 *
 * IPC handlers for the report system
 */

import { ipcMain } from 'electron';
import { getReportGenerator, getTemplateEngine } from '../reports';
import type { ReportGenerationOptions, DateRange, GeneratedReport } from '../reports/types';
import Store from 'electron-store';

const store = new Store();

/**
 * Register report-related IPC handlers
 */
export function registerReportsHandlers(): void {
  // 列出所有模板
  ipcMain.handle('reports:listTemplates', async (_event, category?: string) => {
    try {
      const templateEngine = getTemplateEngine();
      await templateEngine.initialize();

      const templates = templateEngine.getTemplates(category as any);

      return {
        success: true,
        templates: templates.map(t => ({
          id: t.id,
          name: t.name,
          category: t.category,
          description: t.description,
          variables: t.variables,
        })),
        count: templates.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取模板详情
  ipcMain.handle('reports:getTemplate', async (_event, templateId: string) => {
    try {
      const templateEngine = getTemplateEngine();
      await templateEngine.initialize();

      const template = templateEngine.getTemplate(templateId);

      if (!template) {
        return {
          success: false,
          error: `Template not found: ${templateId}`,
        };
      }

      return {
        success: true,
        template: {
          id: template.id,
          name: template.name,
          description: template.description,
          category: template.category,
          content: template.content,
          variables: template.variables,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 生成报告
  ipcMain.handle('reports:generate', async (_event, options: {
    templateId: string;
    startDate?: string;
    endDate?: string;
    includeMemory?: boolean;
    includeConversations?: boolean;
    includeTasks?: boolean;
  }) => {
    try {
      const reportGenerator = getReportGenerator();
      const templateEngine = getTemplateEngine();
      await templateEngine.initialize();

      // 验证模板存在
      const template = templateEngine.getTemplate(options.templateId);
      if (!template) {
        return {
          success: false,
          error: `Template not found: ${options.templateId}`,
        };
      }

      // 解析日期
      const today = new Date();
      const startDate = options.startDate ? new Date(options.startDate) : getDefaultStartDate(template.category, today);
      const endDate = options.endDate ? new Date(options.endDate) : today;

      // 构建 ReportGenerationOptions
      const generationOptions: ReportGenerationOptions = {
        templateId: options.templateId,
        dateRange: { start: startDate, end: endDate },
        includeMemory: options.includeMemory ?? true,
        includeConversations: options.includeConversations ?? false,
        includeTasks: options.includeTasks ?? false,
      };

      // 获取 LLM 配置
      const llmConfig = {
        baseUrl: store.get('apiBaseUrl', 'https://api.openai.com/v1') as string,
        apiKey: store.get('apiKey', '') as string,
        model: store.get('model', 'gpt-4') as string,
      };

      // 根据模板类型调用不同的生成方法
      let report: GeneratedReport;
      switch (template.category) {
        case 'weekly':
          report = await reportGenerator.generateWeeklyReport(generationOptions, llmConfig);
          break;
        case 'daily':
          report = await reportGenerator.generateDailyReport(generationOptions, llmConfig);
          break;
        case 'monthly':
          report = await reportGenerator.generateMonthlyReport(generationOptions, llmConfig);
          break;
        default:
          return {
            success: false,
            error: `Unsupported template category: ${template.category}`,
          };
      }

      return {
        success: true,
        report: {
          id: report.id,
          templateId: report.templateId,
          title: report.title,
          content: report.content,
          format: report.format,
          metadata: report.metadata,
        },
      };
    } catch (error: any) {
      console.error('[Reports] Generate error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  });

  // 导出报告
  ipcMain.handle('reports:export', async (_event, options: {
    reportId: string;
    content: string;
    format: 'markdown' | 'html' | 'docx';
    outputPath?: string;
  }) => {
    try {
      // TODO: 实现报告导出功能
      // - markdown: 直接保存
      // - html: 转换后保存
      // - docx: 使用 docx 库生成

      return {
        success: true,
        message: 'Export functionality will be implemented soon',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 保存报告到历史记录
  ipcMain.handle('reports:saveToHistory', async (_event, report: {
    id: string;
    title: string;
    content: string;
    templateId: string;
    dateRange: { start: number; end: number };
  }) => {
    try {
      const reports = store.get('reports', []) as any[];
      reports.push({
        ...report,
        createdAt: Date.now(),
      });
      store.set('reports', reports);

      return {
        success: true,
        message: 'Report saved to history',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取报告历史
  ipcMain.handle('reports:getHistory', async () => {
    try {
      const reports = store.get('reports', []) as any[];

      return {
        success: true,
        reports: reports.sort((a, b) => b.createdAt - a.createdAt),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 删除历史报告
  ipcMain.handle('reports:deleteFromHistory', async (_event, reportId: string) => {
    try {
      const reports = store.get('reports', []) as any[];
      const filtered = reports.filter(r => r.id !== reportId);
      store.set('reports', filtered);

      return {
        success: true,
        message: 'Report deleted from history',
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Reports handlers registered');
}

/**
 * 辅助函数：获取默认开始日期
 */
function getDefaultStartDate(category: string, today: Date): Date {
  const date = new Date(today);

  switch (category) {
    case 'weekly':
      // 获取本周一
      const day = date.getDay();
      const diff = date.getDate() - day + (day === 0 ? -6 : 1);
      date.setDate(diff);
      break;
    case 'daily':
      // 今天
      break;
    case 'monthly':
      // 获取本月第一天
      date.setDate(1);
      break;
  }

  date.setHours(0, 0, 0, 0);
  return date;
}
