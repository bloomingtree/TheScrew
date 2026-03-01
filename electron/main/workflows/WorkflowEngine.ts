/**
 * Workflow Engine - 工作流执行引擎
 *
 * 负责执行和管理工作流的运行
 */

import { randomUUID } from 'crypto';
import { getToolManager } from '../tools/ToolManager';
import {
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowStep,
  WorkflowStepResult,
} from './types';

export class WorkflowEngine {
  private toolManager = getToolManager();
  private executions: Map<string, WorkflowExecution> = new Map();
  private stepResults: Map<string, Map<string, WorkflowStepResult>> = new Map();

  /**
   * 执行工作流
   */
  async executeWorkflow(
    workflow: WorkflowDefinition,
    inputVariables?: Record<string, any>
  ): Promise<WorkflowExecution> {
    const executionId = randomUUID();

    const execution: WorkflowExecution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      status: 'running',
      currentStepId: workflow.steps[0]?.id || null,
      startedAt: Date.now(),
      results: new Map(),
      stepResults: new Map(),
      variables: { ...workflow.variables, ...inputVariables },
    };

    this.executions.set(executionId, execution);
    this.stepResults.set(executionId, new Map());

    console.log(`[WorkflowEngine] Starting workflow execution: ${workflow.name} (${executionId})`);

    try {
      await this.executeSteps(workflow.steps, execution, workflow.variables);

      execution.status = 'completed';
      execution.completedAt = Date.now();
      console.log(`[WorkflowEngine] Workflow completed: ${workflow.name}`);
    } catch (error: any) {
      execution.status = 'failed';
      execution.error = String(error);
      execution.completedAt = Date.now();
      console.error(`[WorkflowEngine] Workflow failed: ${workflow.name}`, error);
    }

    return execution;
  }

  /**
   * 执行工作流步骤
   */
  private async executeSteps(
    steps: WorkflowStep[],
    execution: WorkflowExecution,
    context: Record<string, any>
  ): Promise<void> {
    for (const step of steps) {
      execution.currentStepId = step.id;

      // 检查是否已取消
      if (execution.status === 'cancelled') {
        throw new Error('Workflow cancelled');
      }

      await this.executeStep(step, execution, context);

      // 保存步骤结果到上下文
      const stepResult = this.stepResults.get(execution.id)?.get(step.id);
      if (stepResult) {
        context[step.id] = stepResult.result;
        execution.results.set(step.id, stepResult.result);
      }
    }
  }

  /**
   * 执行单个步骤
   */
  private async executeStep(
    step: WorkflowStep,
    execution: WorkflowExecution,
    context: Record<string, any>
  ): Promise<void> {
    const stepResult: WorkflowStepResult = {
      stepId: step.id,
      status: 'running',
      startedAt: Date.now(),
    };

    this.ensureStepResults(execution).set(step.id, stepResult);

    console.log(`[WorkflowEngine] Executing step: ${step.name} (${step.type})`);

    try {
      switch (step.type) {
        case 'task':
          await this.executeTask(step, context, stepResult);
          break;

        case 'condition':
          await this.executeCondition(step, context, stepResult);
          break;

        case 'loop':
          await this.executeLoop(step, execution, context, stepResult);
          break;

        case 'parallel':
          await this.executeParallel(step, execution, context, stepResult);
          break;

        case 'delay':
          await this.executeDelay(step, stepResult);
          break;

        default:
          throw new Error(`Unknown step type: ${step.type}`);
      }

      stepResult.status = 'completed';
      stepResult.completedAt = Date.now();
      stepResult.duration = stepResult.completedAt - (stepResult.startedAt || 0);
    } catch (error: any) {
      stepResult.status = 'failed';
      stepResult.error = String(error);
      stepResult.completedAt = Date.now();

      // 处理错误
      await this.handleError(step, execution, context, error);
    }
  }

  /**
   * 执行任务步骤
   */
  private async executeTask(
    step: WorkflowStep,
    context: Record<string, any>,
    stepResult: WorkflowStepResult
  ): Promise<void> {
    // 内置动作
    if (step.action.startsWith('builtin.')) {
      stepResult.result = await this.executeBuiltinAction(step.action, step.parameters, context);
      return;
    }

    // 工具调用
    const tool = this.toolManager.getTool(step.action);
    if (!tool) {
      throw new Error(`Tool not found: ${step.action}`);
    }

    // 解析参数（支持变量替换）
    const resolvedParams = this.resolveParameters(step.parameters || {}, context);

    const result = await tool.handler(resolvedParams);
    stepResult.result = result;
  }

  /**
   * 执行条件分支步骤
   */
  private async executeCondition(
    step: WorkflowStep,
    context: Record<string, any>,
    stepResult: WorkflowStepResult
  ): Promise<void> {
    if (!step.condition) {
      throw new Error('Condition step requires a condition expression');
    }

    const result = this.evaluateCondition(step.condition, context);
    stepResult.result = { condition: step.condition, result };

    // 执行匹配的分支
    if (step.nextSteps) {
      for (const branch of step.nextSteps) {
        if (!branch.condition || this.evaluateCondition(branch.condition, context)) {
          // 这里实际上需要跳转到指定步骤，但由于步骤是顺序执行的，
          // 我们只在结果中记录应该跳转到的步骤
          stepResult.result.nextStepId = branch.stepId;
          break;
        }
      }
    }
  }

  /**
   * 执行循环步骤
   */
  private async executeLoop(
    step: WorkflowStep,
    execution: WorkflowExecution,
    context: Record<string, any>,
    stepResult: WorkflowStepResult
  ): Promise<void> {
    const loopCount = step.loopCount || 1;
    const results: any[] = [];

    for (let i = 0; i < loopCount; i++) {
      // 添加循环变量到上下文
      const loopContext = { ...context, __loop_index: i, __loop_count: loopCount };

      // 如果有子步骤，执行子步骤（这里简化处理，实际需要支持嵌套步骤）
      if (step.action) {
        const result = await this.executeAction(step.action, step.parameters || {}, loopContext);
        results.push(result);
      }
    }

    stepResult.result = results;
  }

  /**
   * 执行并行步骤
   */
  private async executeParallel(
    step: WorkflowStep,
    execution: WorkflowExecution,
    context: Record<string, any>,
    stepResult: WorkflowStepResult
  ): Promise<void> {
    if (!step.nextSteps || step.nextSteps.length === 0) {
      return;
    }

    // 并行执行所有分支
    const promises = step.nextSteps.map(async (branch) => {
      // 这里简化处理，实际需要支持并行执行不同步骤
      if (!branch.condition || this.evaluateCondition(branch.condition, context)) {
        return { stepId: branch.stepId, executed: true };
      }
      return { stepId: branch.stepId, executed: false };
    });

    const results = await Promise.all(promises);
    stepResult.result = results;
  }

  /**
   * 执行延迟步骤
   */
  private async executeDelay(
    step: WorkflowStep,
    stepResult: WorkflowStepResult
  ): Promise<void> {
    const delay = step.delay || 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
    stepResult.result = { delayed: delay };
  }

  /**
   * 执行内置动作
   */
  private async executeBuiltinAction(
    action: string,
    parameters: Record<string, any> | undefined,
    context: Record<string, any>
  ): Promise<any> {
    const resolvedParams = this.resolveParameters(parameters || {}, context);

    switch (action) {
      case 'builtin.setVariable':
        context[resolvedParams.name] = resolvedParams.value;
        return { set: true, name: resolvedParams.name, value: resolvedParams.value };

      case 'builtin.log':
        console.log('[Workflow]', resolvedParams.message);
        return { logged: resolvedParams.message };

      case 'builtin.increment':
        const currentValue = context[resolvedParams.variable] || 0;
        context[resolvedParams.variable] = currentValue + (resolvedParams.amount || 1);
        return { incremented: true, value: context[resolvedParams.variable] };

      case 'builtin.concat':
        const parts = resolvedParams.parts || [];
        return parts.join('');

      default:
        throw new Error(`Unknown builtin action: ${action}`);
    }
  }

  /**
   * 直接执行动作（用于循环等场景）
   */
  private async executeAction(
    action: string,
    parameters: Record<string, any>,
    context: Record<string, any>
  ): Promise<any> {
    if (action.startsWith('builtin.')) {
      return await this.executeBuiltinAction(action, parameters, context);
    }

    const tool = this.toolManager.getTool(action);
    if (!tool) {
      throw new Error(`Tool not found: ${action}`);
    }

    const resolvedParams = this.resolveParameters(parameters, context);
    return await tool.handler(resolvedParams);
  }

  /**
   * 处理错误
   */
  private async handleError(
    step: WorkflowStep,
    execution: WorkflowExecution,
    context: Record<string, any>,
    error: any
  ): Promise<void> {
    const errorHandler = step.onError;

    if (!errorHandler) {
      throw error;
    }

    switch (errorHandler.action) {
      case 'retry':
        const maxRetries = errorHandler.maxRetries || 1;
        const retryCount = (context[`__retry_${step.id}`] || 0) + 1;
        if (retryCount <= maxRetries) {
          context[`__retry_${step.id}`] = retryCount;
          console.log(`[WorkflowEngine] Retrying step ${step.id} (${retryCount}/${maxRetries})`);
          await this.executeStep(step, execution, context);
        } else {
          throw new Error(`Max retries exceeded for step: ${step.id}`);
        }
        break;

      case 'skip':
        console.log(`[WorkflowEngine] Skipping failed step: ${step.id}`);
        break;

      case 'continue':
        console.log(`[WorkflowEngine] Continuing despite error in step: ${step.id}`);
        break;

      case 'fail':
      default:
        throw error;
    }
  }

  /**
   * 评估条件表达式
   */
  private evaluateCondition(condition: string, context: Record<string, any>): boolean {
    // 简单的条件评估
    // 支持：variable == value, variable != value, variable > value, etc.

    // 替换变量
    let expr = condition;
    for (const [key, value] of Object.entries(context)) {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      expr = expr.replace(regex, JSON.stringify(value));
    }

    // 简单评估（仅支持基本比较）
    // TODO: 使用更安全的表达式求值库
    try {
      // 安全的简单评估
      if (expr.includes('==')) {
        const [left, right] = expr.split('==').map(s => s.trim());
        return left === right;
      }
      if (expr.includes('!=')) {
        const [left, right] = expr.split('!=').map(s => s.trim());
        return left !== right;
      }
      if (expr.includes('>')) {
        const [left, right] = expr.split('>').map(s => parseFloat(s.trim()));
        return left > right;
      }
      if (expr.includes('<')) {
        const [left, right] = expr.split('<').map(s => parseFloat(s.trim()));
        return left < right;
      }

      // 默认返回 true
      return true;
    } catch {
      return true;
    }
  }

  /**
   * 解析参数（替换变量）
   */
  private resolveParameters(
    parameters: Record<string, any>,
    context: Record<string, any>
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string' && value.startsWith('${') && value.endsWith('}')) {
        const varName = value.slice(2, -1);
        resolved[key] = context[varName];
      } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        resolved[key] = this.resolveParameters(value, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * 确保步骤结果 Map 存在
   */
  private ensureStepResults(execution: WorkflowExecution): Map<string, WorkflowStepResult> {
    if (!this.stepResults.has(execution.id)) {
      this.stepResults.set(execution.id, new Map());
    }
    return this.stepResults.get(execution.id)!;
  }

  /**
   * 取消工作流执行
   */
  cancelExecution(executionId: string): boolean {
    const execution = this.executions.get(executionId);
    if (execution && execution.status === 'running') {
      execution.status = 'cancelled';
      execution.completedAt = Date.now();
      console.log(`[WorkflowEngine] Cancelled execution: ${executionId}`);
      return true;
    }
    return false;
  }

  /**
   * 获取执行状态
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId);
  }

  /**
   * 获取所有执行记录
   */
  getAllExecutions(): WorkflowExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * 清理已完成的执行记录
   */
  cleanupCompletedExecutions(olderThanMs: number = 3600000): void {
    const now = Date.now();
    const entries = Array.from(this.executions.entries());
    for (const [id, execution] of entries) {
      if (
        execution.completedAt &&
        now - execution.completedAt > olderThanMs
      ) {
        this.executions.delete(id);
        this.stepResults.delete(id);
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let workflowEngineInstance: WorkflowEngine | null = null;

/**
 * Get the singleton WorkflowEngine instance
 */
export function getWorkflowEngine(): WorkflowEngine {
  if (!workflowEngineInstance) {
    workflowEngineInstance = new WorkflowEngine();
  }
  return workflowEngineInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetWorkflowEngine(): void {
  if (workflowEngineInstance) {
    workflowEngineInstance = null;
  }
}

export default WorkflowEngine;
