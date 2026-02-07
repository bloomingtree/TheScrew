/**
 * Subagent Module Types
 */

// Re-export core subagent types
export * from '../core/types';

/**
 * Subagent LLM configuration
 */
export interface SubagentLLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * Subagent execution result
 */
export interface SubagentResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
}

/**
 * Subagent spawn options
 */
export interface SubagentSpawnOptions {
  timeout?: number;
  maxIterations?: number;
  priority?: 'low' | 'normal' | 'high';
}
