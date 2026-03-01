/**
 * Workflow Types - 工作流引擎类型定义
 *
 * 工作流系统的核心类型定义
 */

/**
 * 工作流步骤类型
 */
export type WorkflowStepType = 'task' | 'condition' | 'loop' | 'parallel' | 'delay';

/**
 * 工作流步骤
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: WorkflowStepType;
  action: string;              // 工具名称或内置动作
  parameters?: Record<string, any>;
  nextSteps?: WorkflowBranch[];
  onError?: WorkflowErrorHandler;
  condition?: string;          // 条件表达式（用于 condition 类型）
  loopCount?: number;          // 循环次数（用于 loop 类型）
  delay?: number;              // 延迟毫秒数（用于 delay 类型）
}

/**
 * 工作流分支
 */
export interface WorkflowBranch {
  condition?: string;          // 条件表达式
  stepId: string;              // 下一步骤 ID
}

/**
 * 错误处理
 */
export interface WorkflowErrorHandler {
  action: 'retry' | 'skip' | 'fail' | 'continue';
  maxRetries?: number;
  fallbackStepId?: string;
}

/**
 * 工作流触发器
 */
export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'event' | 'keyword';
  config?: any;
  enabled?: boolean;
}

/**
 * 工作流定义
 */
export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  variables: Record<string, any>;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * 工作流执行状态
 */
export type WorkflowExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';

/**
 * 工作流执行记录
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowExecutionStatus;
  currentStepId: string | null;
  startedAt: number;
  completedAt?: number;
  results: Map<string, any>;
  error?: string;
  stepResults: Map<string, WorkflowStepResult>;
  variables: Record<string, any>;
}

/**
 * 步骤执行结果
 */
export interface WorkflowStepResult {
  stepId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  result?: any;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
}

/**
 * 内置工作流模板
 */
export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  definition: Omit<WorkflowDefinition, 'id' | 'createdAt' | 'updatedAt'> & {
  id: string;
  createdAt?: number;
  updatedAt?: number;
};
}

/**
 * 工作流存储项
 */
export interface StoredWorkflow {
  id: string;
  name: string;
  description: string;
  definition: WorkflowDefinition;
  createdAt: number;
  updatedAt: number;
}
