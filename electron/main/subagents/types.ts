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
  content?: string;
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  duration?: number;
  toolCalls?: any[];
}

/**
 * Sub-agent configuration for enhanced spawn
 */
export interface SubAgentConfig {
  /** Agent type - loads corresponding system prompt and tool restrictions */
  agentType?: 'default' | 'devops' | 'office' | 'secretary';
  /** Tool whitelist - if provided, only these tools are available to the sub-agent */
  allowedTools?: string[];
  /** Maximum LLM iteration rounds (default 5) */
  maxIterations?: number;
  /** Additional system prompt appended after the agent's base prompt */
  systemPromptAddon?: string;
  /** Streaming callback - called for each content chunk from the LLM */
  onChunk?: (chunk: string) => void;
}

/**
 * Subagent spawn options (legacy, for backward compatibility)
 */
export interface SubagentSpawnOptions {
  timeout?: number;
  maxIterations?: number;
  priority?: 'low' | 'normal' | 'high';
}
