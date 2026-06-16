/**
 * Subagent Manager - nanobot style background task execution
 *
 * Responsibilities:
 * - Create background subagent tasks
 * - Manage task status
 * - Query task results
 * - Clean up old tasks
 * - Support agent type specification with system prompts and tool whitelisting
 * - Streaming progress callbacks
 */

import { randomUUID } from 'crypto';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { ISubagentTask, SubagentTaskStatus } from '../core/types';

/**
 * LLM configuration for subagent
 */
export interface SubagentLLMConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
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
 * Subagent execution result
 */
export interface SubagentResult {
  taskId: string;
  status: SubagentTaskStatus;
  content?: string;
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  toolCalls?: any[];
}

/**
 * Internal stored config for retry support
 */
interface StoredTaskConfig {
  llmConfig: SubagentLLMConfig;
  agentConfig?: SubAgentConfig;
  options?: {
    timeout?: number;
    maxIterations?: number;
  };
}

/**
 * Subagent Manager - background task execution
 */
export class SubagentManager {
  private tasks: Map<string, ISubagentTask> = new Map();
  private executingTasks: Set<string> = new Set();
  private taskConfigs: Map<string, StoredTaskConfig> = new Map();
  private chunkCallbacks: Map<string, (chunk: string) => void> = new Map();

  /**
   * Spawn a new subagent task (backward-compatible signature)
   *
   * Can be called in two ways:
   * 1. Legacy: spawn(task, label, parentSessionId, config, options?)
   * 2. Enhanced: spawn(task, label, parentSessionId, config, agentConfig?)
   *
   * The enhanced version (agentConfig as 5th arg) is used by AgentSupervisor.
   */
  async spawn(
    task: string,
    label: string,
    parentSessionId: string,
    config: SubagentLLMConfig,
    optionsOrAgentConfig?: {
      timeout?: number;
      maxIterations?: number;
    } | SubAgentConfig,
  ): Promise<string> {
    const taskId = randomUUID();

    // Determine if 5th arg is legacy options or new SubAgentConfig
    let legacyOptions: { timeout?: number; maxIterations?: number } | undefined;
    let agentConfig: SubAgentConfig | undefined;

    if (optionsOrAgentConfig) {
      if (this.isSubAgentConfig(optionsOrAgentConfig)) {
        agentConfig = optionsOrAgentConfig as SubAgentConfig;
      } else {
        legacyOptions = optionsOrAgentConfig as { timeout?: number; maxIterations?: number };
      }
    }

    const subagentTask: ISubagentTask = {
      id: taskId,
      parentSessionId,
      task,
      label,
      status: 'pending',
      createdAt: Date.now(),
    };

    // Store config for potential retry
    this.taskConfigs.set(taskId, {
      llmConfig: config,
      agentConfig,
      options: legacyOptions,
    });

    // Register streaming callback
    if (agentConfig?.onChunk) {
      this.chunkCallbacks.set(taskId, agentConfig.onChunk);
    }

    this.tasks.set(taskId, subagentTask);
    console.log(`[SubagentManager] Created task ${taskId}: ${label}${agentConfig?.agentType ? ` (agent: ${agentConfig.agentType})` : ''}`);

    // Execute task asynchronously
    this.executeTask(taskId, task, label, config, legacyOptions, agentConfig).catch(error => {
      console.error(`[SubagentManager] Task ${taskId} failed:`, error);
      const t = this.tasks.get(taskId);
      if (t) {
        t.status = 'failed';
        t.error = error.message || String(error);
        t.completedAt = Date.now();
      }
      this.chunkCallbacks.delete(taskId);
    });

    return taskId;
  }

  /**
   * Type guard to distinguish SubAgentConfig from legacy options
   */
  private isSubAgentConfig(obj: any): obj is SubAgentConfig {
    return (
      obj.agentType !== undefined ||
      obj.allowedTools !== undefined ||
      obj.systemPromptAddon !== undefined ||
      obj.onChunk !== undefined ||
      // If it has maxIterations but no timeout, it's likely a SubAgentConfig
      (obj.maxIterations !== undefined && obj.timeout === undefined &&
       Object.keys(obj).some(k => ['agentType', 'allowedTools', 'systemPromptAddon', 'onChunk'].includes(k)))
    );
  }

  /**
   * Load agent system prompt from .config/agents/{agentType}.md
   */
  private async loadAgentSystemPrompt(agentType: string): Promise<string> {
    try {
      const { PathManager } = await import('../config/PathManager');
      const pathManager = PathManager.getInstance();
      const agentPath = join(pathManager.getAgentsPath(), `${agentType}.md`);

      if (!existsSync(agentPath)) {
        console.warn(`[SubagentManager] Agent config not found: ${agentPath}, using default`);
        return `You are a subagent working on a specific task. Complete the task efficiently and report your results.`;
      }

      const content = await readFile(agentPath, 'utf-8');

      // Parse frontmatter (--- ... ---) and extract body
      const body = content.replace(/^---[\s\S]*?---\n*/, '').trim();

      return body || `You are a subagent working on a specific task. Complete the task efficiently and report your results.`;
    } catch (error) {
      console.warn(`[SubagentManager] Failed to load agent prompt for ${agentType}:`, error);
      return `You are a subagent working on a specific task. Complete the task efficiently and report your results.`;
    }
  }

  /**
   * Load agent tool allowlist from .config/agents/{agentType}.md frontmatter
   */
  private async loadAgentToolAllowlist(agentType: string): Promise<string[] | null> {
    try {
      const { PathManager } = await import('../config/PathManager');
      const pathManager = PathManager.getInstance();
      const agentPath = join(pathManager.getAgentsPath(), `${agentType}.md`);

      if (!existsSync(agentPath)) {
        return null;
      }

      const content = await readFile(agentPath, 'utf-8');

      // Parse YAML frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        return null;
      }

      const yaml = frontmatterMatch[1];

      // Simple YAML parsing for tools.allow / allowed_tools
      // Format: "tools:\n  allow:\n    - file.*\n    - bash"
      // Or: "allowed_tools:\n  - file.*"
      const toolsSection = yaml.match(/tools:\s*\n\s+allow:\s*\n((\s+- .+\n?)+)/);
      if (toolsSection) {
        const toolPatterns = toolsSection[1]
          .split('\n')
          .map(line => line.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean);
        if (toolPatterns.length > 0) return toolPatterns;
      }

      const allowedToolsMatch = yaml.match(/allowed_tools:\s*\n((\s+- .+\n?)+)/);
      if (allowedToolsMatch) {
        const toolPatterns = allowedToolsMatch[1]
          .split('\n')
          .map(line => line.replace(/^\s*-\s*/, '').trim())
          .filter(Boolean);
        if (toolPatterns.length > 0) return toolPatterns;
      }

      return null;
    } catch (error) {
      console.warn(`[SubagentManager] Failed to load tool allowlist for ${agentType}:`, error);
      return null;
    }
  }

  /**
   * Filter tool definitions based on allowedTools patterns
   *
   * Patterns support glob-style matching:
   * - "bash" matches exactly "bash"
   * - "file.*" matches "read_file", "write_file", etc.
   * - "*" matches all tools
   */
  private filterTools(allTools: any[], allowedTools: string[]): any[] {
    if (!allowedTools || allowedTools.length === 0) {
      return allTools;
    }

    // If "*" is in the list, allow all tools
    if (allowedTools.includes('*')) {
      return allTools;
    }

    return allTools.filter(tool => {
      const toolName = tool.function?.name || tool.name;
      return allowedTools.some(pattern => {
        if (pattern.includes('*')) {
          // Convert glob pattern to regex
          const regex = new RegExp('^' + pattern.replace(/\./g, '\\.').replace(/\*/g, '.*') + '$');
          return regex.test(toolName);
        }
        return pattern === toolName;
      });
    });
  }

  /**
   * Execute a task (background)
   */
  private async executeTask(
    taskId: string,
    task: string,
    label: string,
    config: SubagentLLMConfig,
    options?: {
      timeout?: number;
      maxIterations?: number;
    },
    agentConfig?: SubAgentConfig,
  ): Promise<void> {
    const subagentTask = this.tasks.get(taskId);
    if (!subagentTask) return;

    // Check if already executing
    if (this.executingTasks.has(taskId)) {
      return;
    }

    this.executingTasks.add(taskId);
    subagentTask.status = 'running';
    subagentTask.startedAt = Date.now();

    console.log(`[SubagentManager] Executing task ${taskId}: ${label}`);

    try {
      // Import dependencies dynamically to avoid circular dependency
      const { getToolManager } = await import('../tools/ToolManager');
      const toolManager = getToolManager();

      // Create LLM client (use existing or create new)
      const { OpenAIClient } = await import('../api/openai');
      const client = new OpenAIClient(
        config.baseUrl,
        config.apiKey,
        config.model,
        config.temperature || 0.7,
        config.maxTokens || 4096
      );

      // Build system prompt
      let systemPrompt: string;
      if (agentConfig?.agentType) {
        systemPrompt = await this.loadAgentSystemPrompt(agentConfig.agentType);
      } else {
        systemPrompt = `You are a subagent working on a specific task. Complete the task efficiently and report your results.`;
      }

      // Append additional system prompt if provided
      if (agentConfig?.systemPromptAddon) {
        systemPrompt = `${systemPrompt}\n\n${agentConfig.systemPromptAddon}`;
      }

      const messages: any[] = [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: task,
        },
      ];

      // Build tool definitions with filtering
      let tools = toolManager.getOpenAIFunctionDefinitions();

      // Determine effective allowedTools: explicit list > agent config file > no filter
      let effectiveAllowedTools = agentConfig?.allowedTools;

      if (!effectiveAllowedTools && agentConfig?.agentType) {
        const agentToolPatterns = await this.loadAgentToolAllowlist(agentConfig.agentType);
        if (agentToolPatterns) {
          effectiveAllowedTools = agentToolPatterns;
        }
      }

      if (effectiveAllowedTools) {
        tools = this.filterTools(tools, effectiveAllowedTools);
        console.log(`[SubagentManager] Task ${taskId}: filtered to ${tools.length} tools (from ${toolManager.getOpenAIFunctionDefinitions().length})`);
      }

      const maxIterations = agentConfig?.maxIterations || options?.maxIterations || 5;
      let iteration = 0;
      let finalContent = '';
      const allToolCalls: any[] = [];
      const onChunk = agentConfig?.onChunk || this.chunkCallbacks.get(taskId);

      while (iteration < maxIterations) {
        iteration++;

        // Collect response chunks
        const chunks: string[] = [];
        let hasToolCalls = false;
        const toolCalls: any[] = [];

        for await (const chunk of client.streamChat(messages, undefined, tools)) {
          try {
            const parsed = JSON.parse(chunk);

            if (parsed.type === 'tool_calls') {
              hasToolCalls = true;
              toolCalls.push(...(parsed.toolCalls || []));
              break;
            } else if (parsed.type === 'content') {
              const text = parsed.content || '';
              chunks.push(text);
              // Streaming callback
              if (onChunk) {
                try { onChunk(text); } catch (_) { /* ignore callback errors */ }
              }
            }
          } catch (e) {
            // Not JSON, treat as content
            chunks.push(chunk);
            // Streaming callback
            if (onChunk) {
              try { onChunk(chunk); } catch (_) { /* ignore callback errors */ }
            }
          }
        }

        const content = chunks.join('');

        if (hasToolCalls && toolCalls.length > 0) {
          allToolCalls.push(...toolCalls);
          // Execute tool calls
          for (const toolCall of toolCalls) {
            const result = await toolManager.executeToolCall({
              id: toolCall.id,
              type: 'function',
              function: {
                name: toolCall.function.name,
                arguments: toolCall.function.arguments,
              },
            });

            messages.push({
              role: 'assistant',
              content: '',
              tool_calls: [toolCall],
            });

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.success
                ? JSON.stringify(result.result)
                : `Error: ${result.error}`,
            });
          }
        } else {
          // No tool calls, we're done
          finalContent = content;
          break;
        }
      }

      subagentTask.status = 'completed';
      subagentTask.result = finalContent || 'Task completed';
      subagentTask.completedAt = Date.now();

      console.log(`[SubagentManager] Task ${taskId} completed`);
    } catch (error: any) {
      subagentTask.status = 'failed';
      subagentTask.error = error.message || String(error);
      subagentTask.completedAt = Date.now();
      console.error(`[SubagentManager] Task ${taskId} error:`, error);
    } finally {
      this.executingTasks.delete(taskId);
      this.chunkCallbacks.delete(taskId);
    }
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): ISubagentTask | null {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get task result
   */
  getTaskResult(taskId: string): SubagentResult | null {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    return {
      taskId: task.id,
      status: task.status,
      content: task.result,
      result: task.result,
      error: task.error,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
  }

  /**
   * Get all tasks for a session
   */
  getTasksBySession(parentSessionId: string): ISubagentTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.parentSessionId === parentSessionId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Get all running tasks
   */
  getRunningTasks(): ISubagentTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.status === 'running' || task.status === 'pending')
      .sort((a, b) => a.createdAt - b.createdAt);
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId);
    if (!task) {
      return false;
    }

    if (task.status === 'pending' || task.status === 'running') {
      task.status = 'cancelled';
      task.completedAt = Date.now();
      this.executingTasks.delete(taskId);
      this.chunkCallbacks.delete(taskId);
      console.log(`[SubagentManager] Task ${taskId} cancelled`);
      return true;
    }

    return false;
  }

  /**
   * Clean up old tasks
   */
  cleanOldTasks(maxAge: number = 24 * 60 * 60 * 1000): number {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [id, task] of this.tasks) {
      const completedAt = task.completedAt || task.createdAt;
      if (now - completedAt > maxAge) {
        toDelete.push(id);
      }
    }

    for (const id of toDelete) {
      this.tasks.delete(id);
      this.taskConfigs.delete(id);
      this.chunkCallbacks.delete(id);
    }

    if (toDelete.length > 0) {
      console.log(`[SubagentManager] Cleaned up ${toDelete.length} old tasks`);
    }

    return toDelete.length;
  }

  /**
   * Get task statistics
   */
  getStats(): {
    totalTasks: number;
    pendingTasks: number;
    runningTasks: number;
    completedTasks: number;
    failedTasks: number;
    cancelledTasks: number;
  } {
    const tasks = Array.from(this.tasks.values());

    return {
      totalTasks: tasks.length,
      pendingTasks: tasks.filter(t => t.status === 'pending').length,
      runningTasks: tasks.filter(t => t.status === 'running').length,
      completedTasks: tasks.filter(t => t.status === 'completed').length,
      failedTasks: tasks.filter(t => t.status === 'failed').length,
      cancelledTasks: tasks.filter(t => t.status === 'cancelled').length,
    };
  }

  /**
   * Clear all tasks
   */
  clear(): void {
    this.tasks.clear();
    this.executingTasks.clear();
    this.taskConfigs.clear();
    this.chunkCallbacks.clear();
    console.log('[SubagentManager] Cleared all tasks');
  }

  /**
   * Wait for task completion
   */
  async waitForTask(taskId: string, timeout?: number): Promise<SubagentResult> {
    const startTime = Date.now();
    const checkInterval = 100;

    while (true) {
      const task = this.tasks.get(taskId);

      if (!task) {
        throw new Error(`Task ${taskId} not found`);
      }

      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
        return {
          taskId: task.id,
          status: task.status,
          content: task.result,
          result: task.result,
          error: task.error,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        };
      }

      // Check timeout
      if (timeout && Date.now() - startTime > timeout) {
        // Mark task as failed on timeout
        task.status = 'failed';
        task.error = `Task timeout after ${timeout}ms`;
        task.completedAt = Date.now();
        this.executingTasks.delete(taskId);
        this.chunkCallbacks.delete(taskId);
        throw new Error(`Task ${taskId} timeout after ${timeout}ms`);
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Retry a failed task using stored config
   */
  async retryTask(taskId: string): Promise<string | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    if (task.status !== 'failed') {
      return null;
    }

    // Retrieve stored config
    const storedConfig = this.taskConfigs.get(taskId);
    if (!storedConfig) {
      console.warn(`[SubagentManager] Cannot retry task ${taskId}: no stored config`);
      return null;
    }

    // Spawn a new task with the same config
    const newTaskId = await this.spawn(
      task.task,
      `${task.label} (retry)`,
      task.parentSessionId,
      storedConfig.llmConfig,
      storedConfig.agentConfig || storedConfig.options,
    );

    console.log(`[SubagentManager] Task ${taskId} retry created as ${newTaskId}`);
    return newTaskId;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let subagentManagerInstance: SubagentManager | null = null;

/**
 * Get the singleton SubagentManager instance
 */
export function getSubagentManager(): SubagentManager {
  if (!subagentManagerInstance) {
    subagentManagerInstance = new SubagentManager();
  }
  return subagentManagerInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetSubagentManager(): void {
  if (subagentManagerInstance) {
    subagentManagerInstance.clear();
  }
  subagentManagerInstance = null;
}

export default SubagentManager;
