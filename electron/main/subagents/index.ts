/**
 * Subagent Module - Zero-Employee Architecture
 * Nanobot style background task execution
 */

export * from './types';
export {
  SubagentManager,
  getSubagentManager,
  resetSubagentManager,
} from './SubagentManager';

export type {
  SubAgentConfig,
  SubagentLLMConfig,
  SubagentResult,
} from './SubagentManager';

export {
  AgentSupervisor,
} from './AgentSupervisor';

export type {
  SubTask,
  SubTaskResult,
  ProgressUpdate,
} from './AgentSupervisor';
