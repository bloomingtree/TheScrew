import { create } from 'zustand';
import {
  Template,
  WordDocumentTemplate,
  PromptTemplate,
  AssistantTool,
  TemplateType,
  TemplateUsage,
  UseTemplateParams,
  ConvertDocumentParams,
  UseAssistantParams,
  AssistantResult,
} from '../types/template';

interface TemplateState {
  // 模板数据
  templates: Template[];
  wordTemplates: WordDocumentTemplate[];
  promptTemplates: PromptTemplate[];
  assistantTools: AssistantTool[];

  // 使用记录
  usageHistory: TemplateUsage[];

  // UI 状态
  selectedTemplate: Template | null;
  isTemplateDialogOpen: boolean;
  isConvertPanelOpen: boolean;
  isAssistantPanelOpen: boolean;
  selectedAssistant: AssistantTool | null;

  // 操作方法
  loadTemplates: () => Promise<void>;
  addTemplate: (template: Template) => Promise<void>;
  updateTemplate: (id: string, updates: Partial<Template>) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  getTemplateById: (id: string) => Template | undefined;
  getTemplatesByCategory: (category: string) => Template[];
  getTemplatesByType: (type: TemplateType) => Template[];

  // 模板使用
  useTemplate: (params: UseTemplateParams) => Promise<{ filePath?: string; content?: string }>;
  convertDocumentWithTemplate: (params: ConvertDocumentParams) => Promise<string>;
  useAssistant: (params: UseAssistantParams) => Promise<AssistantResult>;

  // 记录使用
  recordUsage: (usage: Omit<TemplateUsage, 'id' | 'usedAt'>) => void;

  // UI 方法
  setSelectedTemplate: (template: Template | null) => void;
  setTemplateDialogOpen: (open: boolean) => void;
  setConvertPanelOpen: (open: boolean) => void;
  setAssistantPanelOpen: (open: boolean, assistant?: AssistantTool) => void;
}

export const useTemplateStore = create<TemplateState>((set, get) => ({
  // 初始状态
  templates: [],
  wordTemplates: [],
  promptTemplates: [],
  assistantTools: [],
  usageHistory: [],
  selectedTemplate: null,
  isTemplateDialogOpen: false,
  isConvertPanelOpen: false,
  isAssistantPanelOpen: false,
  selectedAssistant: null,

  // 加载所有模板
  loadTemplates: async () => {
    try {
      const result = await window.electronAPI.template.getTemplates();
      const templates = result.templates || [];
      set({
        templates,
        wordTemplates: templates.filter((t: Template) => t.type === TemplateType.WORD_DOCUMENT) as WordDocumentTemplate[],
        promptTemplates: templates.filter((t: Template) => t.type === TemplateType.PROMPT) as PromptTemplate[],
        assistantTools: templates.filter((t: Template) => t.type === TemplateType.ASSISTANT) as AssistantTool[],
      });
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  },

  // 添加模板
  addTemplate: async (template) => {
    await window.electronAPI.template.addTemplate(template);
    get().loadTemplates();
  },

  // 更新模板
  updateTemplate: async (id, updates) => {
    await window.electronAPI.template.updateTemplate(id, updates);
    get().loadTemplates();
  },

  // 删除模板
  deleteTemplate: async (id) => {
    await window.electronAPI.template.deleteTemplate(id);
    get().loadTemplates();
  },

  // 根据 ID 获取模板
  getTemplateById: (id) => {
    return get().templates.find((t) => t.id === id);
  },

  // 根据分类获取模板
  getTemplatesByCategory: (category) => {
    return get().templates.filter((t) => t.category === category);
  },

  // 根据类型获取模板
  getTemplatesByType: (type) => {
    return get().templates.filter((t) => t.type === type);
  },

  // 使用模板创建文档
  useTemplate: async (params) => {
    const result = await window.electronAPI.template.useTemplate(params);
    get().recordUsage({
      templateId: params.templateId,
      templateType: get().getTemplateById(params.templateId)?.type!,
      conversationId: params.conversationId,
      parameters: params.parameters,
      resultPath: result.filePath,
    });
    return result;
  },

  // 文档格式转换
  convertDocumentWithTemplate: async (params) => {
    const result = await window.electronAPI.template.convertDocument(params);
    if (result.success && result.filePath) {
      return result.filePath;
    }
    throw new Error(result.error || '格式转换失败');
  },

  // 使用助手工具
  useAssistant: async (params) => {
    const result = await window.electronAPI.template.useAssistant(params);
    if (result.success && result.result) {
      return result.result as AssistantResult;
    }
    throw new Error(result.error || '助手调用失败');
  },

  // 记录使用历史
  recordUsage: (usage) => {
    set((state) => ({
      usageHistory: [
        { ...usage, id: Date.now().toString(), usedAt: Date.now() },
        ...state.usageHistory.slice(0, 99), // 保留最近100条
      ],
    }));
  },

  // 设置选中的模板
  setSelectedTemplate: (template) => set({ selectedTemplate: template }),

  // 设置模板对话框状态
  setTemplateDialogOpen: (open) => set({ isTemplateDialogOpen: open }),

  // 设置转换面板状态
  setConvertPanelOpen: (open) => set({ isConvertPanelOpen: open }),

  // 设置助手面板状态
  setAssistantPanelOpen: (open, assistant) =>
    set({
      isAssistantPanelOpen: open,
      selectedAssistant: assistant || null,
    }),
}));
