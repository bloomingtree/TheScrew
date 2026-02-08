/**
 * Core Types for Zero-Employee Architecture
 * Based on nanobot architecture patterns
 */

// ============================================================================
// Tool Types
// ============================================================================

/**
 * Tool base interface - nanobot style
 * All tools must implement this interface
 */
export interface ITool {
  /** Tool name */
  name(): string;

  /** Tool description for LLM */
  description(): string;

  /** Parameters JSON Schema */
  parameters(): Record<string, any>;

  /** Execute the tool */
  execute(args: Record<string, any>): Promise<string | ToolResult>;

  /** Optional: Estimate token usage */
  estimateTokens?(): number;
}

/**
 * Tool call result
 */
export interface ToolResult {
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * Tool call from LLM
 */
export interface IToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

/**
 * Tool execution result
 */
export interface IToolResult {
  toolCallId: string;
  name: string;
  success: boolean;
  result?: any;
  error?: string;
}

// ============================================================================
// Skill Types
// ============================================================================

/**
 * Skill metadata from SKILL.md frontmatter
 */
export interface ISkillMeta {
  /** Skill name */
  name: string;

  /** Skill category (docx, pptx, xlsx, pdf, custom, etc.) */
  category: string;

  /** Short description (for on-demand list) */
  description: string;

  /** Load mode: always or on-demand */
  mode: 'always' | 'on-demand';

  /** Estimated token count */
  estimatedTokens: number;

  /** Keywords for auto-detection */
  keywords: string[];

  /** Path to SKILL.md file */
  path: string;

  /** Optional: Required tools */
  tools?: string[];

  /** Optional: Required system binaries */
  requiresBins?: string[];

  /** Optional: Required environment variables */
  requiresEnv?: string[];
}

/**
 * Complete skill content
 */
export interface ISkill {
  meta: ISkillMeta;

  /** Full skill content (SKILL.md body) */
  content: string;

  /** Related tool names */
  tools: string[];
}

// ============================================================================
// Message Types
// ============================================================================

/**
 * Inbound message (user to agent)
 */
export interface IInboundMessage {
  id: string;
  sessionKey: string;
  content: string;
  media?: Array<{
    type: 'image' | 'audio' | 'video';
    data: string;
    mimeType?: string;
  }>;
  channel?: string;
  chatId?: string;
  timestamp: number;
}

/**
 * Outbound message (agent to user)
 */
export interface IOutboundMessage {
  id: string;
  sessionKey: string;
  content: string;
  toolCalls?: IToolCall[];
  timestamp: number;
  done: boolean;
}

// ============================================================================
// Session Types
// ============================================================================

/**
 * Session message
 */
export interface ISessionMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: IToolCall[];
  toolCallId?: string;
  timestamp: number;
}

/**
 * Session memory
 */
export interface ISessionMemory {
  messages: ISessionMessage[];
  variables: Map<string, any>;
}

/**
 * Session context
 */
export interface ISession {
  id: string;
  agentName?: string;
  activeTools: Set<string>;
  memory: ISessionMemory;
  createdAt: number;
  updatedAt: number;
}

// ============================================================================
// Subagent Types
// ============================================================================

/**
 * Subagent task status
 */
export type SubagentTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Subagent task
 */
export interface ISubagentTask {
  id: string;
  parentSessionId: string;
  task: string;
  label: string;
  status: SubagentTaskStatus;
  result?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

// ============================================================================
// Memory Types
// ============================================================================

/**
 * Memory entry type
 */
export type MemoryEntryType = 'long_term' | 'daily_note';

/**
 * Memory entry
 */
export interface IMemoryEntry {
  id: string;
  type: MemoryEntryType;
  content: string;
  timestamp: number;
  tags?: string[];
}

/**
 * Memory search result
 */
export interface IMemorySearchResult {
  entry: IMemoryEntry;
  relevance: number;
  excerpt: string;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent configuration
 */
export interface IAgentConfig {
  name: string;
  description: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools: {
    allow?: string[];
    deny?: string[];
  };
  systemPrompt?: string;
}

// ============================================================================
// LLM Types
// ============================================================================

/**
 * LLM message format
 */
export interface ILLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: IToolCall[];
  tool_call_id?: string;
}

/**
 * LLM response chunk
 */
export interface ILLMChunk {
  type: 'content' | 'tool_calls' | 'done';
  content?: string;
  toolCalls?: IToolCall[];
}

/**
 * LLM provider configuration
 */
export interface ILLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Core system configuration
 */
export interface ICoreConfig {
  workspace: string;
  maxIterations: number;
  maxHistoryMessages: number;
  defaultModel: string;
  defaultTemperature: number;
  defaultMaxTokens: number;
  skillsPaths: string[];
  memoryPath: string;
  enableMemory: boolean;
  enableSubagents: boolean;
}

// ============================================================================
// Event Types
// ============================================================================

/**
 * Message bus event types
 */
export type MessageBusEvent = 'inbound' | 'outbound' | 'process' | 'error';

/**
 * Message bus event payload
 */
export type MessageBusEventPayload = IInboundMessage | IOutboundMessage | Error;

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Async result type
 */
export type AsyncResult<T> = {
  success: true;
  data: T;
} | {
  success: false;
  error: string;
};

/**
 * Tool execution context
 */
export interface IToolExecutionContext {
  sessionId: string;
  agentName?: string;
  workspace: string;
  permissions: string[];
}
