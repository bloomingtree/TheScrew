/**
 * Report Store - 报告状态管理
 *
 * 使用 Zustand 管理报告生成和模板状态
 */

import { create } from 'zustand';

export interface ReportTemplate {
  id: string;
  name: string;
  category: 'daily' | 'weekly' | 'monthly' | 'custom';
  description: string;
  variables: string[];
}

export interface GeneratedReport {
  id: string;
  templateId: string;
  title: string;
  content: string;
  format: 'markdown';
  metadata: {
    generatedAt: number;
    dateRange: { start: number; end: number };
    dataPoints: number;
  };
}

export interface ReportHistoryItem {
  id: string;
  title: string;
  content: string;
  templateId: string;
  dateRange: { start: number; end: number };
  createdAt: number;
}

interface ReportState {
  // 模板
  templates: ReportTemplate[];
  templatesLoading: boolean;
  templatesError: string | null;

  // 报告生成
  isGenerating: boolean;
  currentReport: GeneratedReport | null;
  generateError: string | null;

  // 报告历史
  history: ReportHistoryItem[];
  historyLoading: boolean;
  historyError: string | null;

  // Actions - 模板
  loadTemplates: (category?: string) => Promise<void>;
  getTemplate: (id: string) => ReportTemplate | undefined;

  // Actions - 报告生成
  generateReport: (options: {
    templateId: string;
    startDate?: string;
    endDate?: string;
    includeMemory?: boolean;
  }) => Promise<void>;
  clearCurrentReport: () => void;

  // Actions - 报告历史
  loadHistory: () => Promise<void>;
  saveToHistory: (report: GeneratedReport) => Promise<void>;
  deleteFromHistory: (reportId: string) => Promise<void>;
  clearHistory: () => void;

  // Actions - 重置
  reset: () => void;
}

export const useReportStore = create<ReportState>((set, get) => ({
  // Initial state
  templates: [],
  templatesLoading: false,
  templatesError: null,
  isGenerating: false,
  currentReport: null,
  generateError: null,
  history: [],
  historyLoading: false,
  historyError: null,

  // 加载模板列表
  loadTemplates: async (category?: string) => {
    set({ templatesLoading: true, templatesError: null });
    try {
      const result = await (window as any).electronAPI.invoke('reports:listTemplates', category);
      if (result.success) {
        set({ templates: result.templates, templatesLoading: false });
      } else {
        set({ templatesError: result.error, templatesLoading: false });
      }
    } catch (error: any) {
      set({ templatesError: error.message, templatesLoading: false });
    }
  },

  // 获取单个模板
  getTemplate: (id: string) => {
    return get().templates.find(t => t.id === id);
  },

  // 生成报告
  generateReport: async (options) => {
    set({ isGenerating: true, generateError: null });
    try {
      const result = await (window as any).electronAPI.invoke('reports:generate', {
        templateId: options.templateId,
        startDate: options.startDate,
        endDate: options.endDate,
        includeMemory: options.includeMemory ?? true,
        includeConversations: false,
        includeTasks: false,
      });

      if (result.success) {
        set({
          currentReport: result.report,
          isGenerating: false,
        });

        // 自动保存到历史
        await get().saveToHistory(result.report);
      } else {
        set({
          generateError: result.error,
          isGenerating: false,
        });
      }
    } catch (error: any) {
      set({
        generateError: error.message,
        isGenerating: false,
      });
    }
  },

  // 清除当前报告
  clearCurrentReport: () => {
    set({ currentReport: null, generateError: null });
  },

  // 加载报告历史
  loadHistory: async () => {
    set({ historyLoading: true, historyError: null });
    try {
      const result = await (window as any).electronAPI.invoke('reports:getHistory');
      if (result.success) {
        set({ history: result.reports, historyLoading: false });
      } else {
        set({ historyError: result.error, historyLoading: false });
      }
    } catch (error: any) {
      set({ historyError: error.message, historyLoading: false });
    }
  },

  // 保存到历史
  saveToHistory: async (report) => {
    try {
      const result = await (window as any).electronAPI.invoke('reports:saveToHistory', {
        id: report.id,
        title: report.title,
        content: report.content,
        templateId: report.templateId,
        dateRange: report.metadata.dateRange,
      });

      if (result.success) {
        // 重新加载历史
        await get().loadHistory();
      }
    } catch (error: any) {
      console.error('Failed to save report to history:', error);
    }
  },

  // 从历史删除
  deleteFromHistory: async (reportId: string) => {
    try {
      const result = await (window as any).electronAPI.invoke('reports:deleteFromHistory', reportId);
      if (result.success) {
        set(state => ({
          history: state.history.filter(r => r.id !== reportId),
        }));
      }
    } catch (error: any) {
      console.error('Failed to delete report from history:', error);
    }
  },

  // 清空历史
  clearHistory: () => {
    set({ history: [] });
  },

  // 重置所有状态
  reset: () => {
    set({
      templates: [],
      templatesLoading: false,
      templatesError: null,
      isGenerating: false,
      currentReport: null,
      generateError: null,
      history: [],
      historyLoading: false,
      historyError: null,
    });
  },
}));
