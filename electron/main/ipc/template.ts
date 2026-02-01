/**
 * 模板相关的 IPC 处理
 */

import { ipcMain } from 'electron';
import { templateManager } from '../utils/TemplateManager';
import {
  Template,
  UseTemplateParams,
  ConvertDocumentParams,
  UseAssistantParams,
  AssistantResult,
  TemplateType,
} from '../../../src/types/template';

/**
 * 注册模板相关的 IPC 处理器
 */
export function registerTemplateHandlers() {
  // 获取所有模板
  ipcMain.handle('template:getTemplates', async () => {
    try {
      await templateManager.initialize();
      const templates = templateManager.getAllTemplates();
      return { success: true, templates };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 获取模板详情
  ipcMain.handle('template:getTemplateDetail', async (_event, templateId: string) => {
    try {
      await templateManager.initialize();
      const template = templateManager.getTemplateById(templateId);
      if (!template) {
        return { success: false, error: `未找到模板：${templateId}` };
      }
      return { success: true, template };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 添加模板
  ipcMain.handle('template:addTemplate', async (_event, template: Template) => {
    try {
      await templateManager.addTemplate(template);
      return { success: true, template };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 更新模板
  ipcMain.handle('template:updateTemplate', async (_event, id: string, updates: Partial<Template>) => {
    try {
      await templateManager.updateTemplate(id, updates);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 删除模板
  ipcMain.handle('template:deleteTemplate', async (_event, id: string) => {
    try {
      await templateManager.deleteTemplate(id);
      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 使用模板创建文档
  ipcMain.handle('template:useTemplate', async (_event, params: UseTemplateParams) => {
    try {
      await templateManager.initialize();

      const template = templateManager.getTemplateById(params.templateId);
      if (!template || template.type !== TemplateType.WORD_DOCUMENT) {
        return { success: false, error: `无效的模板：${params.templateId}` };
      }

      // 生成输出文件名
      const fileName = params.outputPath || `${template.name}-${Date.now()}.docx`;

      await templateManager.useWordTemplate(
        params.templateId,
        params.parameters || {},
        fileName
      );

      return { success: true, filePath: fileName };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 文档格式转换
  ipcMain.handle('template:convertDocument', async (_event, params: ConvertDocumentParams) => {
    try {
      await templateManager.initialize();

      const template = templateManager.getTemplateById(params.templateId);
      if (!template || template.type !== TemplateType.WORD_DOCUMENT) {
        return { success: false, error: `无效的模板：${params.templateId}` };
      }

      // 生成输出文件名
      const outputPath = params.outputPath || params.sourceFile.replace('.docx', '-converted.docx');

      await templateManager.useWordTemplate(
        params.templateId,
        {}, // 格式转换时不填充占位符
        outputPath
      );

      return { success: true, filePath: outputPath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 使用助手工具
  ipcMain.handle('template:useAssistant', async (_event, params: UseAssistantParams) => {
    try {
      await templateManager.initialize();

      const assistant = templateManager.getAssistantConfig(params.assistantId);
      if (!assistant) {
        return { success: false, error: `未找到助手：${params.assistantId}` };
      }

      // 获取关联的提示词模板
      let prompt = params.input;
      if (assistant.promptTemplateId) {
        const promptTemplate = templateManager.getTemplateById(assistant.promptTemplateId);
        if (promptTemplate && promptTemplate.type === TemplateType.PROMPT) {
          // 合并输入参数
          const templateParams = { content: params.input };
          if (params.context) {
            Object.assign(templateParams, JSON.parse(params.context));
          }
          prompt = templateManager.applyPromptTemplate(assistant.promptTemplateId, templateParams);
        }
      }

      const result: AssistantResult = {
        content: prompt,
        turnCount: 1,
        isComplete: !assistant.enableMultiTurn,
        outputFilePath: assistant.outputTemplateId,
      };

      return { success: true, result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 应用提示词模板
  ipcMain.handle('template:applyPrompt', async (_event, templateId: string, parameters: Record<string, any>) => {
    try {
      await templateManager.initialize();

      const template = templateManager.getTemplateById(templateId);
      if (!template || template.type !== TemplateType.PROMPT) {
        return { success: false, error: `无效的提示词模板：${templateId}` };
      }

      const prompt = templateManager.applyPromptTemplate(templateId, parameters);

      return { success: true, prompt };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 获取助手配置
  ipcMain.handle('template:getAssistant', async (_event, assistantId: string) => {
    try {
      await templateManager.initialize();

      const assistant = templateManager.getAssistantConfig(assistantId);
      if (!assistant) {
        return { success: false, error: `未找到助手：${assistantId}` };
      }

      return { success: true, assistant };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 按分类获取模板
  ipcMain.handle('template:getByCategory', async (_event, category: string) => {
    try {
      await templateManager.initialize();
      const templates = templateManager.getTemplatesByCategory(category);
      return { success: true, templates };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 按类型获取模板
  ipcMain.handle('template:getByType', async (_event, type: TemplateType) => {
    try {
      await templateManager.initialize();
      const templates = templateManager.getTemplatesByType(type);
      return { success: true, templates };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}
