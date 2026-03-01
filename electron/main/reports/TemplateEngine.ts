/**
 * Template Engine - 报告模板引擎
 *
 * 负责加载、管理和渲染报告模板
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { app } from 'electron';
import { existsSync } from 'fs';
import {
  ReportTemplate,
  TemplateVariables,
} from './types';

export class TemplateEngine {
  private templates: Map<string, ReportTemplate> = new Map();
  private templatesDir: string;

  constructor() {
    // 模板目录：userData/templates/
    this.templatesDir = join(app.getPath('userData'), 'templates');
  }

  /**
   * 初始化 - 加载内置模板和用户自定义模板
   */
  async initialize(): Promise<void> {
    // 加载内置模板
    await this.loadBuiltInTemplates();

    // 加载用户自定义模板（如果存在）
    await this.loadUserTemplates();

    console.log(`[TemplateEngine] Loaded ${this.templates.size} templates`);
  }

  /**
   * 加载内置模板
   */
  private async loadBuiltInTemplates(): Promise<void> {
    const builtInTemplates: ReportTemplate[] = [
      {
        id: 'weekly-default',
        name: '标准周报',
        description: '标准周报模板，包含工作概述、进展、问题和计划',
        category: 'weekly',
        content: this.getWeeklyTemplate(),
        variables: ['title', 'dateRange', 'overview', 'projects', 'tasks', 'issues', 'nextWeekPlan'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'daily-default',
        name: '标准日报',
        description: '标准日报模板，记录每日工作内容',
        category: 'daily',
        content: this.getDailyTemplate(),
        variables: ['title', 'date', 'content', 'completed', 'tomorrow'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: 'monthly-default',
        name: '标准月报',
        description: '标准月报模板，总结月度工作成果',
        category: 'monthly',
        content: this.getMonthlyTemplate(),
        variables: ['title', 'month', 'overview', 'achievements', 'statistics', 'nextMonthPlan'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    for (const template of builtInTemplates) {
      this.templates.set(template.id, template);
    }
  }

  /**
   * 加载用户自定义模板
   */
  private async loadUserTemplates(): Promise<void> {
    if (!existsSync(this.templatesDir)) {
      return;
    }

    // TODO: 扫描用户模板目录并加载自定义模板
    // 用户模板格式：.zero-employee/templates/template-name/SKILL.md
  }

  /**
   * 渲染模板
   */
  renderTemplate(templateId: string, data: TemplateVariables): string {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    let content = template.content;

    // 替换变量 {{variableName}}
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      content = content.replace(regex, String(value));
    }

    return content;
  }

  /**
   * 获取模板列表
   */
  getTemplates(category?: 'daily' | 'weekly' | 'monthly' | 'custom'): ReportTemplate[] {
    let templates = Array.from(this.templates.values());

    if (category) {
      templates = templates.filter(t => t.category === category);
    }

    return templates.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  }

  /**
   * 获取单个模板
   */
  getTemplate(id: string): ReportTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * 添加自定义模板
   */
  addTemplate(template: ReportTemplate): void {
    this.templates.set(template.id, {
      ...template,
      updatedAt: Date.now(),
    });
  }

  /**
   * 删除模板（只能删除自定义模板）
   */
  removeTemplate(id: string): boolean {
    const template = this.templates.get(id);
    if (!template) {
      return false;
    }

    // 内置模板不能删除
    if (id.startsWith('weekly-default') ||
        id.startsWith('daily-default') ||
        id.startsWith('monthly-default')) {
      return false;
    }

    return this.templates.delete(id);
  }

  // ============================================================================
  // 内置模板内容
  // ============================================================================

  private getWeeklyTemplate(): string {
    return `# {{title}}

## 时间范围
{{dateRange}}

---

## 本周工作概述
{{overview}}

---

## 重点项目进展
{{projects}}

---

## 完成任务列表
{{tasks}}

---

## 遇到的问题与解决方案
{{issues}}

---

## 下周工作计划
{{nextWeekPlan}}

---

*本报告由 AI 助手"螺丝钉"自动生成*`;
  }

  private getDailyTemplate(): string {
    return `# {{title}}

**日期**: {{date}}

---

## 今日工作内容
{{content}}

---

## 今日完成事项
{{completed}}

---

## 明日工作计划
{{tomorrow}}

---

*本报告由 AI 助手"螺丝钉"自动生成*`;
  }

  private getMonthlyTemplate(): string {
    return `# {{title}}

**月份**: {{month}}

---

## 月度工作概述
{{overview}}

---

## 本月成果亮点
{{achievements}}

---

## 工作数据统计
{{statistics}}

---

## 下月工作计划
{{nextMonthPlan}}

---

*本报告由 AI 助手"螺丝钉"自动生成*`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let templateEngineInstance: TemplateEngine | null = null;

/**
 * Get the singleton TemplateEngine instance
 */
export function getTemplateEngine(): TemplateEngine {
  if (!templateEngineInstance) {
    templateEngineInstance = new TemplateEngine();
  }
  return templateEngineInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetTemplateEngine(): void {
  templateEngineInstance = null;
}

export default TemplateEngine;
