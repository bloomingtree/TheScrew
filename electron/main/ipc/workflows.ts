/**
 * Workflows IPC Handlers
 *
 * IPC handlers for the workflow system
 */

import { ipcMain } from 'electron';
import { getWorkflowEngine } from '../workflows/WorkflowEngine';
import { getWorkflowStore } from '../workflows/WorkflowStore';
import type { WorkflowDefinition } from '../workflows/types';

/**
 * Register workflow-related IPC handlers
 */
export function registerWorkflowsHandlers(): void {
  const workflowEngine = getWorkflowEngine();
  const workflowStore = getWorkflowStore();

  // 列出所有工作流
  ipcMain.handle('workflows:list', async () => {
    try {
      const workflows = workflowStore.getAllWorkflows();
      return {
        success: true,
        workflows: workflows.map(w => ({
          id: w.id,
          name: w.name,
          description: w.description,
          enabled: w.definition.enabled,
          createdAt: w.createdAt,
          updatedAt: w.updatedAt,
        })),
        count: workflows.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取单个工作流
  ipcMain.handle('workflows:get', async (_event, id: string) => {
    try {
      const workflow = workflowStore.getWorkflow(id);
      if (!workflow) {
        return {
          success: false,
          error: `Workflow not found: ${id}`,
        };
      }

      return {
        success: true,
        workflow: {
          id: workflow.id,
          name: workflow.name,
          description: workflow.description,
          definition: workflow.definition,
          createdAt: workflow.createdAt,
          updatedAt: workflow.updatedAt,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 保存工作流
  ipcMain.handle('workflows:save', async (_event, workflow: WorkflowDefinition) => {
    try {
      // 验证工作流
      const validation = workflowStore.validateWorkflow(workflow);
      if (!validation.valid) {
        return {
          success: false,
          error: '工作流定义无效',
          validationErrors: validation.errors,
        };
      }

      const saved = workflowStore.saveWorkflow(workflow);

      return {
        success: true,
        workflow: saved,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 删除工作流
  ipcMain.handle('workflows:delete', async (_event, id: string) => {
    try {
      const deleted = workflowStore.deleteWorkflow(id);
      return {
        success: true,
        deleted,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 启用/禁用工作流
  ipcMain.handle('workflows:setEnabled', async (_event, id: string, enabled: boolean) => {
    try {
      const updated = workflowStore.setWorkflowEnabled(id, enabled);
      return {
        success: true,
        updated,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 执行工作流
  ipcMain.handle('workflows:execute', async (_event, id: string, variables?: Record<string, any>) => {
    try {
      const workflow = workflowStore.getWorkflow(id);
      if (!workflow) {
        return {
          success: false,
          error: `Workflow not found: ${id}`,
        };
      }

      const execution = await workflowEngine.executeWorkflow(workflow.definition, variables);

      // 保存执行记录
      workflowStore.saveExecution({
        id: execution.id,
        workflowId: execution.workflowId,
        workflowName: execution.workflowName,
        status: execution.status,
        startedAt: execution.startedAt,
        completedAt: execution.completedAt,
        error: execution.error,
      });

      return {
        success: true,
        execution: {
          id: execution.id,
          workflowId: execution.workflowId,
          workflowName: execution.workflowName,
          status: execution.status,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 取消工作流执行
  ipcMain.handle('workflows:cancel', async (_event, executionId: string) => {
    try {
      const cancelled = workflowEngine.cancelExecution(executionId);
      return {
        success: true,
        cancelled,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取执行状态
  ipcMain.handle('workflows:getExecution', async (_event, executionId: string) => {
    try {
      const execution = workflowEngine.getExecution(executionId);
      if (!execution) {
        return {
          success: false,
          error: `Execution not found: ${executionId}`,
        };
      }

      return {
        success: true,
        execution: {
          id: execution.id,
          workflowId: execution.workflowId,
          workflowName: execution.workflowName,
          status: execution.status,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          error: execution.error,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取执行历史
  ipcMain.handle('workflows:getExecutions', async (_event, workflowId?: string, limit: number = 50) => {
    try {
      const executions = workflowStore.getExecutions(workflowId, limit);
      return {
        success: true,
        executions,
        count: executions.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取内置模板
  ipcMain.handle('workflows:getTemplates', async () => {
    try {
      const templates = workflowStore.getBuiltInTemplates();
      return {
        success: true,
        templates: templates.map(t => ({
          id: t.id,
          name: t.name,
          description: t.description,
          category: t.category,
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

  // 安装内置模板
  ipcMain.handle('workflows:installTemplate', async (_event, templateId: string) => {
    try {
      const installed = workflowStore.installBuiltInTemplate(templateId);
      return {
        success: true,
        installed,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Workflows handlers registered');
}
