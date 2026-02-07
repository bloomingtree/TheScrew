/**
 * Agent Loop - nanobot style core processing engine
 *
 * Responsibilities:
 * - Process inbound messages
 * - Build context (history + memory + skills)
 * - Interact with LLM
 * - Handle tool calls
 * - Return responses
 */

import { OpenAIClient } from '../api/openai';
import { getToolRegistry } from './ToolRegistry';
import { getSkillManager } from './SkillManager';
import { getMemoryStore } from '../memory/MemoryStore';
import { getSubagentManager } from '../subagents/SubagentManager';
import {
  IInboundMessage,
  IOutboundMessage,
  ISession,
  ISessionMessage,
  IToolCall,
  ILLMMessage,
} from './types';

/**
 * Agent Loop configuration
 */
export interface AgentLoopConfig {
  maxIterations?: number;
  maxHistoryMessages?: number;
  defaultModel?: string;
  defaultTemperature?: number;
  defaultMaxTokens?: number;
}

/**
 * Agent Loop - nanobot style core processing engine
 */
export class AgentLoop {
  private toolRegistry = getToolRegistry();
  private skillManager = getSkillManager();
  private memoryStore = getMemoryStore();
  private subagentManager = getSubagentManager();

  private sessions: Map<string, ISession> = new Map();
  private config: Required<AgentLoopConfig>;

  constructor(config?: AgentLoopConfig) {
    this.config = {
      maxIterations: config?.maxIterations || 10,
      maxHistoryMessages: config?.maxHistoryMessages || 50,
      defaultModel: config?.defaultModel || 'gpt-4',
      defaultTemperature: config?.defaultTemperature || 0.7,
      defaultMaxTokens: config?.defaultMaxTokens || 4096,
    };
    console.log('[AgentLoop] Initialized with config:', this.config);
  }

  /**
   * Process a message - nanobot style main flow
   */
  async processMessage(
    message: IInboundMessage,
    llmConfig: {
      baseUrl: string;
      apiKey: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    }
  ): Promise<IOutboundMessage> {
    // 1. Get or create session
    const session = this.getOrCreateSession(message.sessionKey);

    // 2. Add user message to history
    session.memory.messages.push({
      role: 'user',
      content: message.content,
      timestamp: message.timestamp,
    });

    // 3. Detect required skills
    const requiredSkills = this.skillManager.detectRequiredSkills(message.content);
    for (const skillName of requiredSkills) {
      session.activeSkills.add(skillName);
    }

    // 4. Build message list
    let messages = await this.buildMessages(session, message);

    // 5. Agent loop with max iterations
    let iteration = 0;
    let responseContent = '';
    const toolCalls: IToolCall[] = [];

    while (iteration < this.config.maxIterations) {
      iteration++;

      // Create LLM client
      const client = new OpenAIClient(
        llmConfig.baseUrl,
        llmConfig.apiKey,
        llmConfig.model || this.config.defaultModel,
        llmConfig.temperature ?? this.config.defaultTemperature,
        llmConfig.maxTokens ?? this.config.defaultMaxTokens
      );

      // Get tool definitions
      const tools = this.toolRegistry.getDefinitions(session.agentName);

      // Call LLM
      let hasToolCalls = false;

      for await (const chunk of client.streamChat(messages, undefined, tools)) {
        try {
          const parsed = JSON.parse(chunk);

          if (parsed.type === 'tool_calls') {
            hasToolCalls = true;
            toolCalls.push(...(parsed.toolCalls || []));
            break;
          } else if (parsed.type === 'content') {
            responseContent += parsed.content || '';
          }
        } catch (e) {
          // Not JSON, treat as content
          responseContent += chunk;
        }
      }

      // If no tool calls, exit loop
      if (!hasToolCalls || toolCalls.length === 0) {
        break;
      }

      // Execute tool calls
      const results = await this.toolRegistry.executeAll(
        toolCalls.map(tc => ({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        })),
        session.agentName
      );

      // Add tool calls and results to messages
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: toolCalls,
      });

      for (const result of results) {
        messages.push({
          role: 'tool',
          tool_call_id: result.toolCallId,
          content: JSON.stringify(result.success ? result.result : result.error),
        });
      }

      // Check if we should continue
      if (results.every(r => !r.success)) {
        // All tools failed, stop
        break;
      }
    }

    // 6. Add assistant response to history
    session.memory.messages.push({
      role: 'assistant',
      content: responseContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: Date.now(),
    });

    // 7. Trim history if too long
    this.trimHistory(session);

    // 8. Update session timestamp
    session.updatedAt = Date.now();

    return {
      id: message.id,
      sessionKey: message.sessionKey,
      content: responseContent,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      timestamp: Date.now(),
      done: true,
    };
  }

  /**
   * Build message list - nanobot style context building
   */
  private async buildMessages(session: ISession, message: IInboundMessage): Promise<ILLMMessage[]> {
    const messages: ILLMMessage[] = [];

    // 1. System message (skills + memory + agent)
    const systemMessage = await this.buildSystemMessage(session);
    if (systemMessage) {
      messages.push({
        role: 'system',
        content: systemMessage,
      });
    }

    // 2. Agent system prompt (if set)
    if (session.agentName) {
      const agentPrompt = await this.getAgentSystemPrompt(session.agentName);
      if (agentPrompt) {
        messages.push({
          role: 'system',
          content: agentPrompt,
        });
      }
    }

    // 3. History messages (limited)
    const recentMessages = session.memory.messages.slice(-this.config.maxHistoryMessages);
    for (const msg of recentMessages) {
      if (msg.role === 'tool') {
        messages.push({
          role: 'tool',
          tool_call_id: msg.toolCallId!,
          content: msg.content,
        });
      } else {
        messages.push({
          role: msg.role,
          content: msg.content,
          ...(msg.toolCalls && { tool_calls: msg.toolCalls }),
        });
      }
    }

    return messages;
  }

  /**
   * Build system message - nanobot style
   */
  private async buildSystemMessage(session: ISession): Promise<string> {
    const parts: string[] = [];

    // 1. Skills system prompt
    const skillPrompt = this.skillManager.buildSystemPrompt();
    if (skillPrompt) {
      parts.push(skillPrompt);
    }

    // 2. Memory context
    const memoryContext = await this.memoryStore.buildMemoryContext();
    if (memoryContext) {
      parts.push(memoryContext);
    }

    if (parts.length === 0) {
      return '';
    }

    return parts.join('\n\n---\n\n');
  }

  /**
   * Get agent system prompt
   */
  private async getAgentSystemPrompt(agentName: string): Promise<string> {
    // TODO: Get from AgentManager
    return '';
  }

  /**
   * Get or create session
   */
  private getOrCreateSession(sessionKey: string): ISession {
    let session = this.sessions.get(sessionKey);

    if (!session) {
      session = {
        id: sessionKey,
        activeSkills: new Set(),
        activeTools: new Set(),
        memory: {
          messages: [],
          variables: new Map(),
        },
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.sessions.set(sessionKey, session);
      console.log(`[AgentLoop] Created session: ${sessionKey}`);
    }

    return session;
  }

  /**
   * Trim history if too long
   */
  private trimHistory(session: ISession): void {
    const maxMessages = this.config.maxHistoryMessages;
    if (session.memory.messages.length > maxMessages) {
      // Keep system messages and recent messages
      session.memory.messages = session.memory.messages.slice(-maxMessages);
    }
  }

  /**
   * Set session agent
   */
  setSessionAgent(sessionKey: string, agentName: string): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.agentName = agentName;
      session.updatedAt = Date.now();
      console.log(`[AgentLoop] Set agent "${agentName}" for session ${sessionKey}`);
    }
  }

  /**
   * Get session agent
   */
  getSessionAgent(sessionKey: string): string | undefined {
    const session = this.sessions.get(sessionKey);
    return session?.agentName;
  }

  /**
   * Activate a skill for a session
   */
  activateSkill(sessionKey: string, skillName: string): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.activeSkills.add(skillName);
      session.updatedAt = Date.now();
      console.log(`[AgentLoop] Activated skill "${skillName}" for session ${sessionKey}`);
    }
  }

  /**
   * Deactivate a skill for a session
   */
  deactivateSkill(sessionKey: string, skillName: string): void {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.activeSkills.delete(skillName);
      session.updatedAt = Date.now();
      console.log(`[AgentLoop] Deactivated skill "${skillName}" for session ${sessionKey}`);
    }
  }

  /**
   * Get active skills for a session
   */
  getActiveSkills(sessionKey: string): string[] {
    const session = this.sessions.get(sessionKey);
    return session ? Array.from(session.activeSkills) : [];
  }

  /**
   * Reset session
   */
  resetSession(sessionKey: string): void {
    this.sessions.delete(sessionKey);
    console.log(`[AgentLoop] Reset session: ${sessionKey}`);
  }

  /**
   * Get session
   */
  getSession(sessionKey: string): ISession | undefined {
    return this.sessions.get(sessionKey);
  }

  /**
   * Get all sessions
   */
  getAllSessions(): ISession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get session statistics
   */
  getSessionStats(): {
    totalSessions: number;
    totalMessages: number;
    activeSkills: number;
  } {
    const sessions = this.getAllSessions();
    let totalMessages = 0;
    let activeSkills = 0;

    for (const session of sessions) {
      totalMessages += session.memory.messages.length;
      activeSkills += session.activeSkills.size;
    }

    return {
      totalSessions: sessions.length,
      totalMessages,
      activeSkills,
    };
  }

  /**
   * Clear all sessions
   */
  clearSessions(): void {
    this.sessions.clear();
    console.log('[AgentLoop] Cleared all sessions');
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AgentLoopConfig>): void {
    Object.assign(this.config, config);
    console.log('[AgentLoop] Updated config:', this.config);
  }

  /**
   * Get configuration
   */
  getConfig(): Required<AgentLoopConfig> {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let agentLoopInstance: AgentLoop | null = null;

/**
 * Get the singleton AgentLoop instance
 */
export function getAgentLoop(config?: AgentLoopConfig): AgentLoop {
  if (!agentLoopInstance) {
    agentLoopInstance = new AgentLoop(config);
  }
  return agentLoopInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetAgentLoop(): void {
  if (agentLoopInstance) {
    agentLoopInstance.clearSessions();
  }
  agentLoopInstance = null;
}

export default AgentLoop;
