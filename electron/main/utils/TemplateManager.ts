/**
 * 模板管理器
 * 负责模板的加载、解析、应用和样式管理
 */

import path from 'path';
import { readFile, writeFile, readdir, copyFile, mkdir } from 'fs/promises';
import { app } from 'electron';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import {
  WordDocumentTemplate,
  PromptTemplate,
  AssistantTool,
  Template,
  TemplateType,
} from '../../../src/types/template';

// 模板存储路径
const TEMPLATES_DIR = path.join(app.getPath('userData'), 'templates');
const BUILTIN_TEMPLATES_DIR = path.join(process.resourcesPath || process.cwd(), 'templates');
const USER_TEMPLATES_DIR = path.join(TEMPLATES_DIR, 'user');

// 确保目录存在
async function ensureTemplatesDir() {
  await mkdir(TEMPLATES_DIR, { recursive: true });
  await mkdir(USER_TEMPLATES_DIR, { recursive: true });
}

// 内置模板配置
const builtinWordTemplates: WordDocumentTemplate[] = [
  {
    id: 'weekly-report',
    name: '周工作报告',
    description: '标准周工作汇报模板，包含本周工作、下周计划等',
    category: '工作报告',
    type: TemplateType.WORD_DOCUMENT,
    isBuiltIn: true,
    templateFile: 'word/周工作报告.docx',
    styles: {
      title: {
        fontSize: 32, // 16pt, 半字号单位
        bold: true,
        alignment: 'center',
        spacingAfter: 240,
      },
      heading1: {
        fontSize: 28, // 14pt
        bold: true,
        spacingBefore: 200,
        spacingAfter: 160,
      },
      normal: {
        fontSize: 24, // 12pt
        lineSpacing: 320, // 1.5倍行距
        firstLineIndent: 240, // 2字符缩进
      },
    },
    placeholders: [
      { name: 'title', displayName: '报告标题', type: 'text', defaultValue: '周工作报告', required: true },
      { name: 'week', displayName: '周次', type: 'text', defaultValue: '', required: true },
      { name: 'department', displayName: '部门', type: 'text', defaultValue: '', required: true },
      { name: 'reporter', displayName: '汇报人', type: 'text', defaultValue: '', required: true },
      { name: 'date', displayName: '汇报日期', type: 'date', defaultValue: '', required: true },
      { name: 'workContent', displayName: '本周工作内容', type: 'textarea', required: true },
      { name: 'nextPlan', displayName: '下周工作计划', type: 'textarea', required: true },
      { name: 'issues', displayName: '存在问题', type: 'textarea', defaultValue: '无' },
    ],
    footer: {
      text: '第 {PAGE} 页',
      align: 'center',
      showPageNumber: true,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['工作', '周报', '报告'],
  },
  {
    id: 'daily-duty-log',
    name: '日常值班记录',
    description: '值班日志模板，记录值班期间的重要事项',
    category: '值班记录',
    type: TemplateType.WORD_DOCUMENT,
    isBuiltIn: true,
    templateFile: 'word/日常值班记录.docx',
    styles: {
      title: {
        fontSize: 32,
        bold: true,
        alignment: 'center',
      },
      heading1: {
        fontSize: 26,
        bold: true,
      },
      normal: {
        fontSize: 24,
      },
    },
    placeholders: [
      { name: 'date', displayName: '值班日期', type: 'date', required: true },
      { name: 'shift', displayName: '班次', type: 'select', options: ['早班', '中班', '晚班'], required: true },
      { name: 'dutyOfficer', displayName: '值班员', type: 'text', required: true },
      { name: 'weather', displayName: '天气', type: 'text', defaultValue: '' },
      { name: 'importantEvents', displayName: '重要事项', type: 'textarea', defaultValue: '无' },
      { name: 'abnormalSituations', displayName: '异常情况', type: 'textarea', defaultValue: '无异常' },
      { name: 'handover', displayName: '交接事项', type: 'textarea', defaultValue: '无' },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['值班', '日志'],
  },
];

const builtinPromptTemplates: PromptTemplate[] = [
  {
    id: 'work-summary',
    name: '工作汇总',
    description: '将散乱的工作草稿汇总成结构化的工作总结',
    category: '工作助手',
    type: TemplateType.PROMPT,
    isBuiltIn: true,
    content: `你是一个专业的工作总结助手。请根据用户提供的工作草稿，整理成结构化的工作总结。

要求：
1. 按重要性和时间顺序组织内容
2. 使用清晰的小标题分类
3. 突出工作成果和关键信息
4. 语言简洁专业

用户草稿：
{{content}}

请输出结构化的工作总结：`,
    placeholders: [
      { name: 'content', displayName: '工作草稿', type: 'textarea', required: true },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['工作', '汇总'],
  },
  {
    id: 'weekly-report-prompt',
    name: '周报生成',
    description: '将工作草稿转换为正式的周报格式',
    category: '工作助手',
    type: TemplateType.PROMPT,
    isBuiltIn: true,
    content: `请将以下工作内容转换为正式的周工作报告格式。

周报信息：
- 周次：{{week}}
- 部门：{{department}}
- 汇报人：{{reporter}}

工作草稿：
{{content}}

请按以下格式输出：
# {{week}}周工作报告

## 一、本周工作内容
（请分类整理工作内容）

## 二、工作成果
（列出主要成果）

## 三、存在问题
（分析遇到的问题）

## 四、下周工作计划
（规划下周工作）`,
    placeholders: [
      { name: 'week', displayName: '周次', type: 'text', required: true },
      { name: 'department', displayName: '部门', type: 'text', required: true },
      { name: 'reporter', displayName: '汇报人', type: 'text', required: true },
      { name: 'content', displayName: '工作草稿', type: 'textarea', required: true },
    ],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['周报', '工作'],
  },
];

const builtinAssistants: AssistantTool[] = [
  {
    id: 'work-summary-assistant',
    name: '工作汇总助手',
    description: '输入本周工作草稿，自动生成结构化汇总',
    category: '工作助手',
    type: TemplateType.ASSISTANT,
    isBuiltIn: true,
    systemPrompt: '你是一个专业的工作总结助手，擅长将散乱的工作内容整理成结构清晰的总结。你总是：1）按重要性和时间组织内容 2）使用简洁专业的语言 3）突出关键成果 4）保持积极专业的态度。',
    promptTemplateId: 'work-summary',
    enableMultiTurn: true,
    maxTurns: 5,
    inputs: [
      { name: 'content', displayName: '工作草稿', type: 'textarea', required: true },
    ],
    outputFormat: 'markdown',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['工作', '汇总'],
    icon: 'FileText',
  },
  {
    id: 'weekly-report-assistant',
    name: '周报助手',
    description: '帮助生成标准格式的周工作报告',
    category: '工作助手',
    type: TemplateType.ASSISTANT,
    isBuiltIn: true,
    systemPrompt: '你是一个专业的周报写作助手，精通各种周报格式。你会根据用户提供的信息生成格式规范、内容完整的周工作报告。',
    enableMultiTurn: true,
    maxTurns: 8,
    inputs: [
      { name: 'week', displayName: '周次', type: 'text', required: true },
      { name: 'department', displayName: '部门', type: 'text', required: true },
      { name: 'content', displayName: '工作草稿', type: 'textarea', required: true },
    ],
    outputFormat: 'word',
    outputTemplateId: 'weekly-report',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: ['周报', '工作'],
    icon: 'Calendar',
  },
];

/**
 * 模板管理器类
 */
export class TemplateManager {
  private templates: Map<string, Template> = new Map();
  private initialized = false;

  /**
   * 初始化模板管理器
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    await ensureTemplatesDir();

    // 加载内置模板
    await this.loadBuiltinTemplates();

    // 加载用户自定义模板
    await this.loadUserTemplates();

    this.initialized = true;
  }

  /**
   * 加载内置模板
   */
  private async loadBuiltinTemplates(): Promise<void> {
    // 加载 Word 模板
    for (const template of builtinWordTemplates) {
      this.templates.set(template.id, template);
    }

    // 加载提示词模板
    for (const template of builtinPromptTemplates) {
      this.templates.set(template.id, template);
    }

    // 加载助手工具
    for (const assistant of builtinAssistants) {
      this.templates.set(assistant.id, assistant);
    }
  }

  /**
   * 加载用户自定义模板
   */
  private async loadUserTemplates(): Promise<void> {
    try {
      const files = await readdir(USER_TEMPLATES_DIR);

      for (const file of files) {
        if (file.endsWith('.json')) {
          try {
            const filePath = path.join(USER_TEMPLATES_DIR, file);
            const content = await readFile(filePath, 'utf-8');
            const template = JSON.parse(content) as Template;

            this.templates.set(template.id, template);
          } catch (error) {
            console.error(`Failed to load template ${file}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load user templates:', error);
    }
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): Template[] {
    return Array.from(this.templates.values());
  }

  /**
   * 根据 ID 获取模板
   */
  getTemplateById(id: string): Template | undefined {
    return this.templates.get(id);
  }

  /**
   * 根据类型获取模板
   */
  getTemplatesByType(type: TemplateType): Template[] {
    return this.getAllTemplates().filter((t) => t.type === type);
  }

  /**
   * 根据分类获取模板
   */
  getTemplatesByCategory(category: string): Template[] {
    return this.getAllTemplates().filter((t) => t.category === category);
  }

  /**
   * 添加模板
   */
  async addTemplate(template: Template): Promise<void> {
    await ensureTemplatesDir();

    // 如果是用户自定义的 Word 模板，复制模板文件
    if (template.type === TemplateType.WORD_DOCUMENT && !template.isBuiltIn) {
      await this.copyTemplateFile(template as WordDocumentTemplate);
    }

    // 确保模板有 updatedAt 字段
    const templateWithTimestamp = { ...template, updatedAt: Date.now() } as Template;

    // 保存模板配置
    const filePath = path.join(USER_TEMPLATES_DIR, `${template.id}.json`);
    await writeFile(filePath, JSON.stringify(templateWithTimestamp, null, 2), 'utf-8');

    this.templates.set(template.id, templateWithTimestamp);
  }

  /**
   * 复制用户上传的模板文件
   */
  private async copyTemplateFile(template: WordDocumentTemplate): Promise<void> {
    const sourcePath = template.templateFile;
    const fileName = path.basename(sourcePath);
    const destDir = path.join(USER_TEMPLATES_DIR, 'word');
    const destPath = path.join(destDir, fileName);

    await mkdir(destDir, { recursive: true });
    await copyFile(sourcePath, destPath);

    // 更新模板文件路径
    template.templateFile = `user/word/${fileName}`;
  }

  /**
   * 更新模板
   */
  async updateTemplate(id: string, updates: Partial<Template>): Promise<void> {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`Template ${id} not found`);
    }

    // 创建更新后的模板，确保类型正确
    const updatedTemplate: Template = {
      ...template,
      ...updates,
      updatedAt: Date.now(),
    } as Template;

    // 保存更新后的模板
    const filePath = path.join(USER_TEMPLATES_DIR, `${id}.json`);
    await writeFile(filePath, JSON.stringify(updatedTemplate, null, 2), 'utf-8');

    this.templates.set(id, updatedTemplate);
  }

  /**
   * 删除模板
   */
  async deleteTemplate(id: string): Promise<void> {
    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`Template ${id} not found`);
    }

    // 内置模板不能删除
    if (template.isBuiltIn) {
      throw new Error('Cannot delete built-in template');
    }

    // 删除模板配置文件
    const filePath = path.join(USER_TEMPLATES_DIR, `${id}.json`);
    await writeFile(filePath, ''); // 清空文件而不是删除，避免权限问题

    this.templates.delete(id);
  }

  /**
   * 使用 Word 模板创建文档
   */
  async useWordTemplate(
    templateId: string,
    parameters: Record<string, any>,
    outputPath: string
  ): Promise<string> {
    const template = this.getTemplateById(templateId) as WordDocumentTemplate;
    if (!template || template.type !== TemplateType.WORD_DOCUMENT) {
      throw new Error(`Invalid template: ${templateId}`);
    }

    // 获取模板文件路径
    const templatePath = this.getTemplateFilePath(template);

    // 读取模板文件
    const content = await readFile(templatePath);
    const zip = new PizZip(content);

    // 创建 docxtemplater 实例
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    // 填充占位符
    doc.setData(parameters);
    doc.render();

    // 生成输出文件
    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });

    await writeFile(outputPath, buffer);

    return outputPath;
  }

  /**
   * 获取模板文件路径
   */
  private getTemplateFilePath(template: WordDocumentTemplate): string {
    if (template.isBuiltIn) {
      return path.join(BUILTIN_TEMPLATES_DIR, template.templateFile);
    } else {
      return path.join(TEMPLATES_DIR, template.templateFile);
    }
  }

  /**
   * 将占位符应用到提示词模板
   */
  applyPromptTemplate(templateId: string, parameters: Record<string, any>): string {
    const template = this.getTemplateById(templateId) as PromptTemplate;
    if (!template || template.type !== TemplateType.PROMPT) {
      throw new Error(`Invalid prompt template: ${templateId}`);
    }

    let content = template.content;

    // 替换占位符
    for (const [key, value] of Object.entries(parameters)) {
      const placeholder = `{{${key}}}`;
      content = content.replace(new RegExp(placeholder, 'g'), String(value));
    }

    return content;
  }

  /**
   * 获取助手配置
   */
  getAssistantConfig(assistantId: string): AssistantTool | undefined {
    const assistant = this.getTemplateById(assistantId);
    if (assistant && assistant.type === TemplateType.ASSISTANT) {
      return assistant as AssistantTool;
    }
    return undefined;
  }
}

// 单例实例
export const templateManager = new TemplateManager();
