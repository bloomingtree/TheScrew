/**
 * Workflow Store - 工作流存储管理
 *
 * 使用 electron-store 持久化存储工作流定义
 */

import Store from 'electron-store';
import { randomUUID } from 'crypto';
import {
  WorkflowDefinition,
  StoredWorkflow,
  WorkflowTemplate,
  WorkflowStep,
  WorkflowStepType,
} from './types';

// 工作流存储键
const WORKFLOWS_KEY = 'workflows';
const EXECUTIONS_KEY = 'workflow_executions';

export class WorkflowStore {
  private store: Store;

  constructor() {
    this.store = new Store({
      name: 'workflows',
      // 加密密钥（生产环境应从安全配置获取）
      encryptionKey: 'workflow-encryption-key-change-in-production',
    });
  }

  // ========================================================================
  // 工作流定义管理
  // ========================================================================

  /**
   * 获取所有工作流
   */
  getAllWorkflows(): StoredWorkflow[] {
    const workflows = this.store.get(WORKFLOWS_KEY, []) as StoredWorkflow[];
    return workflows.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 获取单个工作流
   */
  getWorkflow(id: string): StoredWorkflow | undefined {
    const workflows = this.store.get(WORKFLOWS_KEY, []) as StoredWorkflow[];
    return workflows.find(w => w.id === id);
  }

  /**
   * 保存工作流
   */
  saveWorkflow(workflow: WorkflowDefinition): StoredWorkflow {
    const workflows = this.store.get(WORKFLOWS_KEY, []) as StoredWorkflow[];
    const now = Date.now();

    const existingIndex = workflows.findIndex(w => w.id === workflow.id);
    const storedWorkflow: StoredWorkflow = {
      id: workflow.id,
      name: workflow.name,
      description: workflow.description,
      definition: {
        ...workflow,
        updatedAt: now,
      },
      createdAt: existingIndex >= 0 ? workflows[existingIndex].createdAt : now,
      updatedAt: now,
    };

    if (existingIndex >= 0) {
      workflows[existingIndex] = storedWorkflow;
    } else {
      workflows.push(storedWorkflow);
    }

    this.store.set(WORKFLOWS_KEY, workflows);
    console.log(`[WorkflowStore] Saved workflow: ${workflow.name}`);
    return storedWorkflow;
  }

  /**
   * 删除工作流
   */
  deleteWorkflow(id: string): boolean {
    const workflows = this.store.get(WORKFLOWS_KEY, []) as StoredWorkflow[];
    const filtered = workflows.filter(w => w.id !== id);

    if (filtered.length < workflows.length) {
      this.store.set(WORKFLOWS_KEY, filtered);
      console.log(`[WorkflowStore] Deleted workflow: ${id}`);
      return true;
    }

    return false;
  }

  /**
   * 启用/禁用工作流
   */
  setWorkflowEnabled(id: string, enabled: boolean): boolean {
    const workflows = this.store.get(WORKFLOWS_KEY, []) as StoredWorkflow[];
    const workflow = workflows.find(w => w.id === id);

    if (workflow) {
      workflow.definition.enabled = enabled;
      workflow.definition.updatedAt = Date.now();
      workflow.updatedAt = Date.now();
      this.store.set(WORKFLOWS_KEY, workflows);
      return true;
    }

    return false;
  }

  // ========================================================================
  // 内置工作流模板
  // ========================================================================

  /**
   * 获取内置模板
   */
  getBuiltInTemplates(): WorkflowTemplate[] {
    return [
      {
        id: 'weekly-report-workflow',
        name: '自动周报生成',
        description: '每周五下午自动生成本周工作总结',
        category: 'report',
        definition: {
          id: 'weekly-report-workflow',
          name: '自动周报生成',
          description: '每周五下午自动生成本周工作总结',
          version: '1.0.0',
          steps: [
            {
              id: 'collect-data',
              name: '收集数据',
              type: 'task',
              action: 'builtin.log',
              parameters: { message: '正在收集本周工作数据...' },
            },
            {
              id: 'generate-report',
              name: '生成报告',
              type: 'task',
              action: 'generate_weekly_report',
              parameters: { template_id: 'weekly-default' },
            },
            {
              id: 'save-report',
              name: '保存报告',
              type: 'task',
              action: 'builtin.log',
              parameters: { message: '报告已生成并保存到历史记录' },
            },
          ],
          triggers: [
            {
              type: 'schedule',
              config: { cron: '0 17 * * 5' }, // 每周五 17:00
              enabled: false, // 默认禁用，由用户启用
            },
          ],
          variables: {},
          enabled: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
      {
        id: 'daily-cleanup-workflow',
        name: '每日清理',
        description: '每天清理临时文件和旧数据',
        category: 'maintenance',
        definition: {
          id: 'daily-cleanup-workflow',
          name: '每日清理',
          description: '每天清理临时文件和旧数据',
          version: '1.0.0',
          steps: [
            {
              id: 'log-start',
              name: '记录开始',
              type: 'task',
              action: 'builtin.log',
              parameters: { message: '开始每日清理任务...' },
            },
            {
              id: 'cleanup-temp',
              name: '清理临时文件',
              type: 'task',
              action: 'builtin.log',
              parameters: { message: '清理临时文件' },
            },
            {
              id: 'log-end',
              name: '记录完成',
              type: 'task',
              action: 'builtin.log',
              parameters: { message: '每日清理完成' },
            },
          ],
          triggers: [
            {
              type: 'schedule',
              config: { cron: '0 2 * * *' }, // 每天凌晨 2 点
              enabled: false,
            },
          ],
          variables: {},
          enabled: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      },
    ];
  }

  /**
   * 安装内置模板
   */
  installBuiltInTemplate(templateId: string): boolean {
    const templates = this.getBuiltInTemplates();
    const template = templates.find(t => t.id === templateId);

    if (!template) {
      return false;
    }

    // 检查是否已安装
    const existing = this.getWorkflow(templateId);
    if (existing) {
      return false;
    }

    const workflow: WorkflowDefinition = {
      ...template.definition,
      id: templateId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.saveWorkflow(workflow);
    return true;
  }

  // ========================================================================
  // 执行历史管理
  // ========================================================================

  /**
   * 保存执行记录
   */
  saveExecution(execution: any): void {
    const executions = this.store.get(EXECUTIONS_KEY, []) as any[];
    executions.push(execution);

    // 只保留最近 100 条记录
    if (executions.length > 100) {
      executions.splice(0, executions.length - 100);
    }

    this.store.set(EXECUTIONS_KEY, executions);
  }

  /**
   * 获取执行历史
   */
  getExecutions(workflowId?: string, limit: number = 50): any[] {
    let executions = this.store.get(EXECUTIONS_KEY, []) as any[];

    if (workflowId) {
      executions = executions.filter(e => e.workflowId === workflowId);
    }

    return executions
      .sort((a, b) => b.startedAt - a.startedAt)
      .slice(0, limit);
  }

  /**
   * 清理旧的执行记录
   */
  cleanupExecutions(olderThanMs: number = 7 * 24 * 3600000): void {
    const executions = this.store.get(EXECUTIONS_KEY, []) as any[];
    const now = Date.now();
    const filtered = executions.filter(e => now - e.startedAt < olderThanMs);
    this.store.set(EXECUTIONS_KEY, filtered);
  }

  // ========================================================================
  // 工具方法
  // ========================================================================

  /**
   * 创建新的工作流 ID
   */
  generateId(): string {
    return randomUUID();
  }

  /**
   * 验证工作流定义
   */
  validateWorkflow(workflow: WorkflowDefinition): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!workflow.name || workflow.name.trim() === '') {
      errors.push('工作流名称不能为空');
    }

    if (!workflow.steps || workflow.steps.length === 0) {
      errors.push('工作流至少需要一个步骤');
    }

    // 验证步骤
    const stepIds = new Set<string>();
    for (const step of workflow.steps) {
      if (!step.id || step.id.trim() === '') {
        errors.push('步骤 ID 不能为空');
      }

      if (stepIds.has(step.id)) {
        errors.push(`步骤 ID 重复: ${step.id}`);
      }
      stepIds.add(step.id);

      // 验证分支引用
      if (step.nextSteps) {
        for (const branch of step.nextSteps) {
          if (!stepIds.has(branch.stepId) && branch.stepId !== step.id) {
            // 允许引用后续步骤，在完整验证时需要二次检查
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let workflowStoreInstance: WorkflowStore | null = null;

/**
 * Get the singleton WorkflowStore instance
 */
export function getWorkflowStore(): WorkflowStore {
  if (!workflowStoreInstance) {
    workflowStoreInstance = new WorkflowStore();
  }
  return workflowStoreInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetWorkflowStore(): void {
  workflowStoreInstance = null;
}

export default WorkflowStore;
