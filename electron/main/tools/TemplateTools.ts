/**
 * 模板工具组
 * 提供模板相关的工具，供大模型调用
 */

import { Tool } from './ToolManager';
import { getWorkspacePath } from './FileTools';
import path from 'path';
import { readFile } from 'fs/promises';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import { templateManager } from '../utils/TemplateManager';
import {
  TemplateType,
  WordDocumentTemplate,
  PromptTemplate,
  AssistantTool,
} from '../../../src/types/template';

interface TemplateToolArgs {
  templateId?: string;
  templateName?: string;
  category?: string;
  type?: string;
  outputPath?: string;
  fileName?: string;
  parameters?: Record<string, any>;
  sourceFile?: string;
  placeholderName?: string;
  placeholderValue?: string;
  assistantId?: string;
  input?: string;
  context?: string;
  content?: string;
  week?: string;
  department?: string;
  reporter?: string;
  name?: string;
  description?: string;
  templateFile?: string;
  placeholders?: any[];
  _toolCallId?: string;
}

/**
 * 分析 Word 文档内容结构
 * 用于智能格式转换
 */
async function analyzeDocumentStructure(filePath: string): Promise<{
  title?: string;
  headings: Array<{ level: number; text: string }>;
  paragraphs: string[];
  tables: number;
}> {
  try {
    const content = await readFile(filePath);
    const zip = new PizZip(content);
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    const text = doc.getFullText();
    const lines = text.split('\n').filter((line) => line.trim());

    // 简单的标题识别（假设首行是标题）
    const title = lines[0] || '';

    // 识别可能的标题（短且独立的行）
    const headings: Array<{ level: number; text: string }> = [];
    const paragraphs: string[] = [];

    for (const line of lines.slice(1)) {
      if (line.length < 30 && /^[一二三三四五六七八九十第0-9]/.test(line)) {
        headings.push({ level: 2, text: line });
      } else {
        paragraphs.push(line);
      }
    }

    return { title, headings, paragraphs, tables: 0 };
  } catch (error) {
    console.error('Failed to analyze document:', error);
    return { title: '', headings: [], paragraphs: [], tables: 0 };
  }
}

/**
 * 根据模板样式重新生成文档
 */
async function regenerateDocumentWithStyle(
  sourceContent: string,
  template: WordDocumentTemplate,
  outputPath: string
): Promise<string> {
  const paragraphs = sourceContent.split('\n').filter((p) => p.trim());

  const children: Paragraph[] = [];

  // 标题
  if (paragraphs[0]) {
    const titleStyle = template.styles.title || {};
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: paragraphs[0],
            bold: titleStyle.bold ?? true,
            size: titleStyle.fontSize || 32,
          }),
        ],
        alignment: (titleStyle.alignment === 'center' ? AlignmentType.CENTER :
                   titleStyle.alignment === 'left' ? AlignmentType.LEFT :
                   titleStyle.alignment === 'right' ? AlignmentType.RIGHT :
                   AlignmentType.JUSTIFIED),
        spacing: {
          after: titleStyle.spacingAfter || 240,
        },
      })
    );
  }

  // 正文段落
  const normalStyle = template.styles.normal || {};
  for (const para of paragraphs.slice(1)) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: para,
            size: normalStyle.fontSize || 24,
          }),
        ],
        spacing: {
          before: normalStyle.spacingBefore || 120,
          after: normalStyle.spacingAfter || 120,
        },
        indent: normalStyle.firstLineIndent ? {
          firstLine: normalStyle.firstLineIndent,
        } : undefined,
      })
    );
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  await writeFile(outputPath, buffer);

  return outputPath;
}

// 导入 writeFile
import { writeFile } from 'fs/promises';

/**
 * 模板工具列表
 */
export const templateTools: Tool[] = [
  // 获取模板列表
  {
    name: 'get_templates',
    description: '获取所有可用的模板列表，包括 Word 文档模板、提示词模板和助手工具',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          description: '模板分类，如"工作报告"、"值班记录"、"工作助手"等（可选）',
        },
        type: {
          type: 'string',
          description: '模板类型：word_document（Word文档）、prompt（提示词）、assistant（助手工具）',
          enum: ['word_document', 'prompt', 'assistant'],
        },
      },
    },
    handler: async ({ category, type }: TemplateToolArgs) => {
      await templateManager.initialize();

      let templates = templateManager.getAllTemplates();

      if (category) {
        templates = templates.filter((t) => t.category === category);
      }

      if (type) {
        templates = templates.filter((t) => t.type === type);
      }

      return {
        success: true,
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
          type: t.type,
          isBuiltIn: t.isBuiltIn ?? false,
        })),
        count: templates.length,
      };
    },
  },

  // 获取模板详情
  {
    name: 'get_template_detail',
    description: '获取指定模板的详细信息，包括占位符和样式配置',
    parameters: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: '模板ID或模板名称',
        },
      },
      required: ['templateId'],
    },
    handler: async ({ templateId }: TemplateToolArgs) => {
      await templateManager.initialize();

      const template = templateManager.getTemplateById(templateId!) ||
                      templateManager.getAllTemplates().find((t) => t.name === templateId);

      if (!template) {
        return {
          success: false,
          error: `未找到模板：${templateId}`,
        };
      }

      return {
        success: true,
        template: {
          ...template,
        },
      };
    },
  },

  // 使用模板创建文档
  {
    name: 'use_template',
    description: '使用指定的 Word 模板创建新文档，自动填充占位符并应用模板的样式配置',
    parameters: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: '模板ID或模板名称',
        },
        fileName: {
          type: 'string',
          description: '输出文件名，如"周报-第1周.docx"',
        },
        parameters: {
          type: 'object',
          description: '占位符参数值，如 { title: "xxx", week: "1" }',
        },
      },
      required: ['templateId', 'fileName'],
    },
    handler: async ({ templateId, fileName, parameters }: TemplateToolArgs) => {
      await templateManager.initialize();

      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: '工作空间未设置' };
      }

      const template = templateManager.getTemplateById(templateId!) ||
                      templateManager.getAllTemplates().find((t) => t.name === templateId);

      if (!template || template.type !== TemplateType.WORD_DOCUMENT) {
        return { success: false, error: `未找到 Word 模板：${templateId}` };
      }

      const outputPath = path.join(workspacePath, fileName!);

      try {
        await templateManager.useWordTemplate(
          template.id,
          parameters || {},
          outputPath
        );

        return {
          success: true,
          message: '文档创建成功',
          filePath: fileName,
          fullPath: outputPath,
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  // 文档格式转换（AI 智能分析）
  {
    name: 'convert_document_format',
    description: '将现有 Word 文档按指定模板格式重新生成。AI 会分析文档内容结构，识别标题、正文等内容，然后按模板样式重新排版',
    parameters: {
      type: 'object',
      properties: {
        sourceFile: {
          type: 'string',
          description: '源 Word 文件路径',
        },
        templateId: {
          type: 'string',
          description: '目标模板ID或模板名称',
        },
        outputPath: {
          type: 'string',
          description: '输出文件路径（可选，默认在源文件同目录）',
        },
      },
      required: ['sourceFile', 'templateId'],
    },
    handler: async ({ sourceFile, templateId, outputPath }: TemplateToolArgs) => {
      await templateManager.initialize();

      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: '工作空间未设置' };
      }

      const template = templateManager.getTemplateById(templateId!) ||
                      templateManager.getAllTemplates().find((t) => t.name === templateId);

      if (!template || template.type !== TemplateType.WORD_DOCUMENT) {
        return { success: false, error: `未找到 Word 模板：${templateId}` };
      }

      const sourcePath = path.join(workspacePath, sourceFile!);
      const outputFileName = outputPath || sourceFile!.replace('.docx', '-格式化.docx');
      const fullPath = path.join(workspacePath, outputFileName);

      try {
        // 读取源文件内容
        const content = await readFile(sourcePath);
        const zip = new PizZip(content);
        const doc = new Docxtemplater(zip, {
          paragraphLoop: true,
          linebreaks: true,
        });
        const sourceContent = doc.getFullText();

        // 分析文档结构
        const analysis = await analyzeDocumentStructure(sourcePath);

        // 根据模板重新生成
        await regenerateDocumentWithStyle(sourceContent, template as WordDocumentTemplate, fullPath);

        return {
          success: true,
          message: '文档格式转换成功',
          outputPath: outputFileName,
          fullPath,
          analysis: {
            title: analysis.title,
            headingsCount: analysis.headings.length,
            paragraphsCount: analysis.paragraphs.length,
          },
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  // 使用助手工具
  {
    name: 'use_assistant',
    description: '使用内置助手工具（如工作汇总助手），支持多轮对话',
    parameters: {
      type: 'object',
      properties: {
        assistantId: {
          type: 'string',
          description: '助手ID或助手名称',
        },
        input: {
          type: 'string',
          description: '用户输入内容（草稿）',
        },
        context: {
          type: 'string',
          description: '额外上下文信息（可选）',
        },
      },
      required: ['assistantId', 'input'],
    },
    handler: async ({ assistantId, input, context }: TemplateToolArgs) => {
      await templateManager.initialize();

      const assistant = templateManager.getAssistantConfig(assistantId!) ||
                       templateManager.getAllTemplates().find(
                         (t) => t.type === TemplateType.ASSISTANT && t.name === assistantId
                       ) as AssistantTool;

      if (!assistant) {
        return {
          success: false,
          error: `未找到助手：${assistantId}`,
        };
      }

      // 获取关联的提示词模板
      let prompt = input;
      if (assistant.promptTemplateId) {
        const promptTemplate = templateManager.getTemplateById(assistant.promptTemplateId) as PromptTemplate;
        if (promptTemplate) {
          const templateParams: Record<string, any> = { content: input };
          if (context) {
            try {
              const contextObj = typeof context === 'string' ? JSON.parse(context) : context;
              Object.assign(templateParams, contextObj);
            } catch {
              // 如果解析失败，忽略 context
            }
          }
          prompt = templateManager.applyPromptTemplate(
            assistant.promptTemplateId,
            templateParams
          );
        }
      }

      return {
        success: true,
        assistantId: assistant.id,
        assistantName: assistant.name,
        systemPrompt: assistant.systemPrompt,
        prompt,
        enableMultiTurn: assistant.enableMultiTurn,
        maxTurns: assistant.maxTurns,
        outputFormat: assistant.outputFormat,
        outputTemplateId: assistant.outputTemplateId,
        message: '助手已准备就绪，请继续对话',
      };
    },
  },

  // 应用提示词模板
  {
    name: 'apply_prompt_template',
    description: '将参数应用到提示词模板，生成完整的提示词',
    parameters: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: '提示词模板ID或名称',
        },
        parameters: {
          type: 'object',
          description: '占位符参数值',
        },
      },
      required: ['templateId', 'parameters'],
    },
    handler: async ({ templateId, parameters }: TemplateToolArgs) => {
      await templateManager.initialize();

      const template = templateManager.getTemplateById(templateId!) ||
                      templateManager.getAllTemplates().find((t) => t.name === templateId);

      if (!template || template.type !== TemplateType.PROMPT) {
        return {
          success: false,
          error: `未找到提示词模板：${templateId}`,
        };
      }

      const prompt = templateManager.applyPromptTemplate(
        template.id,
        parameters || {}
      );

      return {
        success: true,
        templateId: template.id,
        templateName: template.name,
        prompt,
        message: '提示词已生成，可直接发送给大模型',
      };
    },
  },

  // 添加自定义模板
  {
    name: 'add_custom_template',
    description: '添加用户自定义的 Word 模板',
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: '模板名称',
        },
        description: {
          type: 'string',
          description: '模板描述',
        },
        category: {
          type: 'string',
          description: '模板分类',
        },
        templateFile: {
          type: 'string',
          description: '模板文件路径',
        },
        placeholders: {
          type: 'array',
          description: '占位符定义',
          items: {
            type: 'object',
          },
        },
      },
      required: ['name', 'description', 'category', 'templateFile'],
    },
    handler: async ({ name, description, category, templateFile, placeholders }: TemplateToolArgs) => {
      await templateManager.initialize();

      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: '工作空间未设置' };
      }

      const templateFilePath = path.join(workspacePath, templateFile!);

      const newTemplate: WordDocumentTemplate = {
        id: `custom-${Date.now()}`,
        name: name!,
        description: description!,
        category: category!,
        type: TemplateType.WORD_DOCUMENT,
        isBuiltIn: false,
        templateFile: templateFilePath,
        styles: {
          title: { fontSize: 32, bold: true, alignment: 'center' },
          normal: { fontSize: 24 },
        },
        placeholders: (placeholders as any) || [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      try {
        await templateManager.addTemplate(newTemplate);

        return {
          success: true,
          templateId: newTemplate.id,
          message: '自定义模板添加成功',
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },

  // 删除自定义模板
  {
    name: 'delete_template',
    description: '删除用户自定义的模板（内置模板不能删除）',
    parameters: {
      type: 'object',
      properties: {
        templateId: {
          type: 'string',
          description: '模板ID',
        },
      },
      required: ['templateId'],
    },
    handler: async ({ templateId }: TemplateToolArgs) => {
      await templateManager.initialize();

      try {
        await templateManager.deleteTemplate(templateId!);

        return {
          success: true,
          message: '模板删除成功',
        };
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },
];
