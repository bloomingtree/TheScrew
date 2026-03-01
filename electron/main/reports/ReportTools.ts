/**
 * Report Tools - 工作总结报告工具
 *
 * 注册到 ToolManager 的报告相关工具
 */

import { Tool, ToolGroup } from '../tools/ToolManager';
import { getReportGenerator, getTemplateEngine } from './index';
import { ReportGenerationOptions, DateRange } from './types';

/**
 * 报告工具定义
 */
export const reportTools: Tool[] = [
  {
    name: 'generate_weekly_report',
    description: '生成本周工作总结报告。从记忆系统中提取本周工作记录，使用 AI 生成结构化的周报。',
    parameters: {
      type: 'object',
      properties: {
        template_id: {
          type: 'string',
          description: '报告模板 ID，默认使用 weekly-default',
          default: 'weekly-default',
        },
        start_date: {
          type: 'string',
          description: '开始日期 (YYYY-MM-DD)，默认为本周一',
        },
        end_date: {
          type: 'string',
          description: '结束日期 (YYYY-MM-DD)，默认为今天',
        },
        include_memory: {
          type: 'boolean',
          description: '是否包含记忆数据',
          default: true,
        },
      },
      required: [],
    },
    handler: async (args: any) => {
      const reportGenerator = getReportGenerator();

      // 解析日期
      const today = new Date();
      let startDate = args.start_date ? new Date(args.start_date) : getMondayOfWeek(today);
      let endDate = args.end_date ? new Date(args.end_date) : today;

      const options: ReportGenerationOptions = {
        templateId: args.template_id || 'weekly-default',
        dateRange: { start: startDate, end: endDate },
        includeMemory: args.include_memory ?? true,
        includeConversations: false,
        includeTasks: false,
      };

      // TODO: 从配置中获取 LLM 配置
      // 这里暂时返回提示信息，实际需要通过 chat 接口调用
      return {
        success: true,
        message: `准备生成周报，时间范围: ${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`,
        templateId: options.templateId,
        dateRange: {
          start: startDate.getTime(),
          end: endDate.getTime(),
        },
        note: '请通过聊天系统调用报告生成功能，此工具仅用于参数验证',
      };
    },
  },

  {
    name: 'generate_daily_report',
    description: '生成今日工作报告。从记忆系统中提取今日工作记录，生成日报。',
    parameters: {
      type: 'object',
      properties: {
        template_id: {
          type: 'string',
          description: '报告模板 ID，默认使用 daily-default',
          default: 'daily-default',
        },
        date: {
          type: 'string',
          description: '报告日期 (YYYY-MM-DD)，默认为今天',
        },
      },
      required: [],
    },
    handler: async (args: any) => {
      const targetDate = args.date ? new Date(args.date) : new Date();

      return {
        success: true,
        message: `准备生成日报，日期: ${targetDate.toISOString().split('T')[0]}`,
        templateId: args.template_id || 'daily-default',
        date: targetDate.getTime(),
        note: '请通过聊天系统调用报告生成功能',
      };
    },
  },

  {
    name: 'list_report_templates',
    description: '列出所有可用的报告模板',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '筛选模板类型: daily, weekly, monthly, custom',
          enum: ['daily', 'weekly', 'monthly', 'custom'],
        },
      },
      required: [],
    },
    handler: async (args: any) => {
      const templateEngine = getTemplateEngine();
      await templateEngine.initialize();

      const templates = templateEngine.getTemplates(args.category as any);

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
    },
  },

  {
    name: 'get_report_template',
    description: '获取指定报告模板的详细内容',
    parameters: {
      type: 'object',
      properties: {
        template_id: {
          type: 'string',
          description: '模板 ID',
        },
      },
      required: ['template_id'],
    },
    handler: async (args: any) => {
      const templateEngine = getTemplateEngine();
      await templateEngine.initialize();

      const template = templateEngine.getTemplate(args.template_id);

      if (!template) {
        return {
          success: false,
          error: `Template not found: ${args.template_id}`,
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
    },
  },
];

/**
 * 报告工具组
 */
export const reportToolGroup: ToolGroup = {
  name: 'reports',
  description: '工作总结报告工具',
  tools: reportTools,
  keywords: ['report', '报告', '总结', '周报', '日报', '月报'],
  triggers: {
    keywords: [
      '生成报告',
      '工作总结',
      '周报',
      '日报',
      '月报',
      'generate report',
    ],
    fileExtensions: [],
    dependentTools: [],
  },
};

/**
 * 辅助函数：获取本周一的日期
 */
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default reportTools;
