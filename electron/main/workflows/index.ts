/**
 * Workflows Module - 工作流引擎模块
 *
 * 导出工作流模块的所有公共接口
 */

export * from './types';
export { WorkflowEngine, getWorkflowEngine, resetWorkflowEngine } from './WorkflowEngine';
export { WorkflowStore, getWorkflowStore, resetWorkflowStore } from './WorkflowStore';

// 类型重新导出（保持兼容性）
export type {
  WorkflowStep,
  WorkflowStepType,
  WorkflowDefinition,
  WorkflowExecution,
  WorkflowExecutionStatus,
  WorkflowTemplate,
  StoredWorkflow,
} from './types';
