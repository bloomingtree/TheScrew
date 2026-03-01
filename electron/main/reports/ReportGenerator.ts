/**
 * Report Generator - 工作总结生成器
 *
 * 从记忆系统提取数据，使用 AI 生成结构化的工作总结
 */

import { randomUUID } from 'crypto';
import { getMemoryStore } from '../memory/MemoryStore';
import { getTemplateEngine } from './TemplateEngine';
import { OpenAIClient } from '../api/openai';
import {
  ReportGenerationOptions,
  GeneratedReport,
  DateRange,
  ReportDataSource,
  TemplateVariables,
} from './types';

export class ReportGenerator {
  private memoryStore = getMemoryStore();
  private templateEngine = getTemplateEngine();

  /**
   * 生成周报
   */
  async generateWeeklyReport(
    options: ReportGenerationOptions,
    llmConfig: {
      baseUrl: string;
      apiKey: string;
      model?: string;
    }
  ): Promise<GeneratedReport> {
    // 1. 提取数据
    const dataSource = await this.collectData(options.dateRange);

    // 2. 使用 AI 生成报告内容
    const reportContent = await this.generateWithAI(dataSource, 'weekly', llmConfig);

    // 3. 使用模板渲染最终报告
    const template = this.templateEngine.getTemplate(options.templateId);
    if (!template) {
      throw new Error(`Template not found: ${options.templateId}`);
    }

    const variables: TemplateVariables = {
      title: this.generateTitle('weekly', options.dateRange),
      dateRange: this.formatDateRange(options.dateRange),
      overview: reportContent.overview || '',
      projects: reportContent.projects || '',
      tasks: reportContent.tasks || '',
      issues: reportContent.issues || '',
      nextWeekPlan: reportContent.nextWeekPlan || '',
    };

    const content = this.templateEngine.renderTemplate(options.templateId, variables);

    return {
      id: randomUUID(),
      templateId: options.templateId,
      title: String(variables.title || ''),
      content,
      format: 'markdown',
      metadata: {
        generatedAt: Date.now(),
        dateRange: {
          start: options.dateRange.start.getTime(),
          end: options.dateRange.end.getTime(),
        },
        dataPoints: dataSource.notes.size + dataSource.conversations + dataSource.tasks,
      },
    };
  }

  /**
   * 生成日报
   */
  async generateDailyReport(
    options: ReportGenerationOptions,
    llmConfig: {
      baseUrl: string;
      apiKey: string;
      model?: string;
    }
  ): Promise<GeneratedReport> {
    const dataSource = await this.collectData(options.dateRange);
    const reportContent = await this.generateWithAI(dataSource, 'daily', llmConfig);

    const template = this.templateEngine.getTemplate(options.templateId);
    if (!template) {
      throw new Error(`Template not found: ${options.templateId}`);
    }

    const variables: TemplateVariables = {
      title: this.generateTitle('daily', options.dateRange),
      date: this.formatDate(options.dateRange.start),
      content: reportContent.content || '',
      completed: reportContent.completed || '',
      tomorrow: reportContent.tomorrow || '',
    };

    const content = this.templateEngine.renderTemplate(options.templateId, variables);

    return {
      id: randomUUID(),
      templateId: options.templateId,
      title: String(variables.title || ''),
      content,
      format: 'markdown',
      metadata: {
        generatedAt: Date.now(),
        dateRange: {
          start: options.dateRange.start.getTime(),
          end: options.dateRange.end.getTime(),
        },
        dataPoints: dataSource.notes.size + dataSource.conversations + dataSource.tasks,
      },
    };
  }

  /**
   * 生成月报
   */
  async generateMonthlyReport(
    options: ReportGenerationOptions,
    llmConfig: {
      baseUrl: string;
      apiKey: string;
      model?: string;
    }
  ): Promise<GeneratedReport> {
    const dataSource = await this.collectData(options.dateRange);
    const reportContent = await this.generateWithAI(dataSource, 'monthly', llmConfig);

    const template = this.templateEngine.getTemplate(options.templateId);
    if (!template) {
      throw new Error(`Template not found: ${options.templateId}`);
    }

    const variables: TemplateVariables = {
      title: this.generateTitle('monthly', options.dateRange),
      month: this.formatMonth(options.dateRange.start),
      overview: reportContent.overview || '',
      achievements: reportContent.achievements || '',
      statistics: reportContent.statistics || '',
      nextMonthPlan: reportContent.nextMonthPlan || '',
    };

    const content = this.templateEngine.renderTemplate(options.templateId, variables);

    return {
      id: randomUUID(),
      templateId: options.templateId,
      title: String(variables.title || ''),
      content,
      format: 'markdown',
      metadata: {
        generatedAt: Date.now(),
        dateRange: {
          start: options.dateRange.start.getTime(),
          end: options.dateRange.end.getTime(),
        },
        dataPoints: dataSource.notes.size + dataSource.conversations + dataSource.tasks,
      },
    };
  }

  /**
   * 收集数据源
   */
  private async collectData(dateRange: DateRange): Promise<ReportDataSource> {
    const daysDiff = Math.ceil((dateRange.end.getTime() - dateRange.start.getTime()) / (1000 * 60 * 60 * 24));
    const notes = await this.memoryStore.getRecentNotes(daysDiff + 1);

    // TODO: 从数据库获取对话数量和任务数量
    // 这里暂时使用占位值
    const conversations = 0;
    const tasks = 0;

    return {
      notes,
      conversations,
      tasks,
      dateRange,
    };
  }

  /**
   * 使用 AI 生成报告内容
   */
  private async generateWithAI(
    dataSource: ReportDataSource,
    reportType: 'daily' | 'weekly' | 'monthly',
    llmConfig: { baseUrl: string; apiKey: string; model?: string }
  ): Promise<Record<string, string>> {
    // 构建系统提示词
    const systemPrompt = this.buildSystemPrompt(reportType);

    // 构建用户消息
    const userMessage = this.buildUserMessage(dataSource, reportType);

    // 创建 OpenAI 客户端
    const client = new OpenAIClient(
      llmConfig.baseUrl,
      llmConfig.apiKey,
      llmConfig.model || 'gpt-4',
      0.7,
      4096
    );

    // 调用 LLM
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    let fullContent = '';
    for await (const chunk of client.streamChat(messages)) {
      fullContent += chunk;
    }

    // 解析 AI 返回的结构化内容
    return this.parseAIResponse(fullContent, reportType);
  }

  /**
   * 构建系统提示词
   */
  private buildSystemPrompt(reportType: 'daily' | 'weekly' | 'monthly'): string {
    const basePrompt = `你是一个专业的工作总结助手，负责生成结构化的工作报告。

你的输出应该是简洁、专业、有条理的中文内容。`;

    if (reportType === 'weekly') {
      return `${basePrompt}

对于周报，请按以下结构输出：
- overview: 本周工作概述（2-3句话）
- projects: 重点项目进展（分点列出）
- tasks: 完成任务列表（分点列出）
- issues: 遇到的问题与解决方案
- nextWeekPlan: 下周工作计划

输出格式：
overview: |
  ...内容...

projects: |
  - 项目1：进展描述
  - 项目2：进展描述

tasks: |
  - 任务1
  - 任务2

issues: |
  问题描述及解决方案

nextWeekPlan: |
  - 计划1
  - 计划2`;
    }

    if (reportType === 'daily') {
      return `${basePrompt}

对于日报，请按以下结构输出：
- content: 今日工作内容
- completed: 今日完成事项
- tomorrow: 明日工作计划`;
    }

    if (reportType === 'monthly') {
      return `${basePrompt}

对于月报，请按以下结构输出：
- overview: 月度工作概述
- achievements: 本月成果亮点
- statistics: 工作数据统计
- nextMonthPlan: 下月工作计划`;
    }

    return basePrompt;
  }

  /**
   * 构建用户消息
   */
  private buildUserMessage(dataSource: ReportDataSource, reportType: string): string {
    const dateRangeStr = this.formatDateRange(dataSource.dateRange);

    let content = `## 时间范围\n${dateRangeStr}\n\n`;

    // 添加笔记内容
    if (dataSource.notes.size > 0) {
      content += `## 工作记录\n\n`;
      const entries = Array.from(dataSource.notes.entries());
      for (const [date, note] of entries) {
        content += `### ${date}\n${note}\n\n`;
      }
    }

    // 添加统计信息
    content += `## 统计信息\n\n`;
    content += `- 笔记数量: ${dataSource.notes.size}\n`;
    content += `- 对话数量: ${dataSource.conversations}\n`;
    content += `- 任务数量: ${dataSource.tasks}\n`;

    content += `\n请根据以上信息生成${reportType === 'weekly' ? '周' : reportType === 'daily' ? '日' : '月'}报。`;

    return content;
  }

  /**
   * 解析 AI 响应
   */
  private parseAIResponse(content: string, reportType: string): Record<string, string> {
    const result: Record<string, string> = {};

    // 简单解析：按行分割，提取各个部分
    const lines = content.split('\n');
    let currentKey = '';
    let currentContent = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // 检查是否是键行 (e.g., "overview: |")
      const keyMatch = trimmed.match(/^(\w+):\s*\|?$/);
      if (keyMatch) {
        // 保存之前的内容
        if (currentKey) {
          result[currentKey] = currentContent.trim();
        }
        currentKey = keyMatch[1];
        currentContent = '';
      } else {
        currentContent += line + '\n';
      }
    }

    // 保存最后的内容
    if (currentKey) {
      result[currentKey] = currentContent.trim();
    }

    // 如果解析失败，返回原始内容
    if (Object.keys(result).length === 0) {
      if (reportType === 'weekly') {
        return { overview: content, projects: '', tasks: '', issues: '', nextWeekPlan: '' };
      }
      return { content };
    }

    return result;
  }

  /**
   * 生成报告标题
   */
  private generateTitle(type: string, dateRange: DateRange): string {
    if (type === 'weekly') {
      return `周报 - ${this.formatDateRange(dateRange)}`;
    }
    if (type === 'daily') {
      return `日报 - ${this.formatDate(dateRange.start)}`;
    }
    if (type === 'monthly') {
      return `月报 - ${this.formatMonth(dateRange.start)}`;
    }
    return '工作报告';
  }

  /**
   * 格式化日期范围
   */
  private formatDateRange(dateRange: DateRange): string {
    const start = this.formatDate(dateRange.start);
    const end = this.formatDate(dateRange.end);
    return `${start} ~ ${end}`;
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * 格式化月份
   */
  private formatMonth(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}年${month}月`;
  }

  /**
   * 列出可用模板
   */
  listTemplates() {
    return this.templateEngine.getTemplates();
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let reportGeneratorInstance: ReportGenerator | null = null;

/**
 * Get the singleton ReportGenerator instance
 */
export function getReportGenerator(): ReportGenerator {
  if (!reportGeneratorInstance) {
    reportGeneratorInstance = new ReportGenerator();
  }
  return reportGeneratorInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetReportGenerator(): void {
  reportGeneratorInstance = null;
}

export default ReportGenerator;
