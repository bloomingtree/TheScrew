/**
 * Workflow Store - 工作流状态管理
 *
 * 使用 Zustand 管理工作流状态
 */

import { create } from 'zustand';

export interface Workflow {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: string;
  startedAt: number;
  completedAt?: number;
  error?: string;
}

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
}

interface WorkflowState {
  // 工作流列表
  workflows: Workflow[];
  workflowsLoading: boolean;
  workflowsError: string | null;

  // 当前工作流
  currentWorkflow: any | null;

  // 执行历史
  executions: WorkflowExecution[];
  executionsLoading: boolean;

  // 模板
  templates: WorkflowTemplate[];

  // Actions - 工作流
  loadWorkflows: () => Promise<void>;
  saveWorkflow: (workflow: any) => Promise<void>;
  deleteWorkflow: (id: string) => Promise<void>;
  setWorkflowEnabled: (id: string, enabled: boolean) => Promise<void>;
  executeWorkflow: (id: string, variables?: any) => Promise<void>;
  cancelExecution: (executionId: string) => Promise<void>;

  // Actions - 模板
  loadTemplates: () => Promise<void>;
  installTemplate: (templateId: string) => Promise<void>;

  // Actions - 执行历史
  loadExecutions: (workflowId?: string) => Promise<void>;

  // 重置
  reset: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Initial state
  workflows: [],
  workflowsLoading: false,
  workflowsError: null,
  currentWorkflow: null,
  executions: [],
  executionsLoading: false,
  templates: [],

  // 加载工作流列表
  loadWorkflows: async () => {
    set({ workflowsLoading: true, workflowsError: null });
    try {
      const result = await (window as any).electronAPI.invoke('workflows:list');
      if (result.success) {
        set({ workflows: result.workflows, workflowsLoading: false });
      } else {
        set({ workflowsError: result.error, workflowsLoading: false });
      }
    } catch (error: any) {
      set({ workflowsError: error.message, workflowsLoading: false });
    }
  },

  // 保存工作流
  saveWorkflow: async (workflow) => {
    try {
      const result = await (window as any).electronAPI.invoke('workflows:save', workflow);
      if (result.success) {
        await get().loadWorkflows();
        return result.workflow;
      } else {
        throw new Error(result.error || '保存失败');
      }
    } catch (error: any) {
      throw error;
    }
  },

  // 删除工作流
  deleteWorkflow: async (id: string) => {
    try {
      const result = await (window as any).electronAPI.invoke('workflows:delete', id);
      if (result.success) {
        set(state => ({
          workflows: state.workflows.filter(w => w.id !== id),
        }));
      }
    } catch (error: any) {
      console.error('Failed to delete workflow:', error);
    }
  },

  // 启用/禁用工作流
  setWorkflowEnabled: async (id: string, enabled: boolean) => {
    try {
      const result = await (window as any).electronAPI.invoke('workflows:setEnabled', id, enabled);
      if (result.success) {
        set(state => ({
          workflows: state.workflows.map(w =>
            w.id === id ? { ...w, enabled } : w
          ),
        }));
      }
    } catch (error: any) {
      console.error('Failed to set workflow enabled:', error);
    }
  },

  // 执行工作流
  executeWorkflow: async (id: string, variables?: any) => {
    try {
      const result = await (window as any).electronAPI.invoke('workflows:execute', id, variables);
      if (result.success) {
        await get().loadExecutions();
      } else {
        throw new Error(result.error || '执行失败');
      }
    } catch (error: any) {
      throw error;
    }
  },

  // 取消执行
  cancelExecution: async (executionId: string) => {
    try {
      await (window as any).electronAPI.invoke('workflows:cancel', executionId);
      await get().loadExecutions();
    } catch (error: any) {
      console.error('Failed to cancel execution:', error);
    }
  },

  // 加载模板
  loadTemplates: async () => {
    try {
      const result = await (window as any).electronAPI.invoke('workflows:getTemplates');
      if (result.success) {
        set({ templates: result.templates });
      }
    } catch (error: any) {
      console.error('Failed to load templates:', error);
    }
  },

  // 安装模板
  installTemplate: async (templateId: string) => {
    try {
      const result = await (window as any).electronAPI.invoke('workflows:installTemplate', templateId);
      if (result.success && result.installed) {
        await get().loadWorkflows();
      }
      return result.installed;
    } catch (error: any) {
      console.error('Failed to install template:', error);
      return false;
    }
  },

  // 加载执行历史
  loadExecutions: async (workflowId?: string) => {
    set({ executionsLoading: true });
    try {
      const result = await (window as any).electronAPI.invoke('workflows:getExecutions', workflowId);
      if (result.success) {
        set({ executions: result.executions, executionsLoading: false });
      }
    } catch (error: any) {
      set({ executionsLoading: false });
      console.error('Failed to load executions:', error);
    }
  },

  // 重置
  reset: () => {
    set({
      workflows: [],
      workflowsLoading: false,
      workflowsError: null,
      currentWorkflow: null,
      executions: [],
      executionsLoading: false,
      templates: [],
    });
  },
}));
