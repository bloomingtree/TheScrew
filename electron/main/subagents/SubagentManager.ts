/**
 * Subagent Manager - nanobot style background task execution
 *
 * Responsibilities:
 * - Create background subagent tasks
 * - Manage task status
 * - Query task results
 * - Clean up old tasks
 */

import { v4 as uuidv4 } from 'uuid';
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
 * Subagent execution result
 */
export interface SubagentResult {
  taskId: string;
  status: SubagentTaskStatus;
  result?: string;
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

/**
 * Subagent Manager - background task execution
 */
export class SubagentManager {
  private tasks: Map<string, ISubagentTask> = new Map();
  private executingTasks: Set<string> = new Set();

  /**
   * Spawn a new subagent task
   */
  async spawn(
    task: string,
    label: string,
    parentSessionId: string,
    config: SubagentLLMConfig,
    options?: {
      timeout?: number;
      maxIterations?: number;
    }
  ): Promise<string> {
    const taskId = uuidv4();

    const subagentTask: ISubagentTask = {
      id: taskId,
      parentSessionId,
      task,
      label,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.tasks.set(taskId, subagentTask);
    console.log(`[SubagentManager] Created task ${taskId}: ${label}`);

    // Execute task asynchronously
    this.executeTask(taskId, task, label, config, options).catch(error => {
      console.error(`[SubagentManager] Task ${taskId} failed:`, error);
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = 'failed';
        task.error = error.message || String(error);
        task.completedAt = Date.now();
      }
    });

    return taskId;
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
    }
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
      const { getToolRegistry } = await import('../core/ToolRegistry');
      const toolRegistry = getToolRegistry();

      // Create LLM client (use existing or create new)
      const { default: OpenAIClient } = await import('../api/openai');
      const client = new OpenAIClient(
        config.baseUrl,
        config.apiKey,
        config.model,
        config.temperature || 0.7,
        config.maxTokens || 4096
      );

      const messages = [
        {
          role: 'system',
          content: `You are a subagent working on a specific task. Complete the task efficiently and report your results.`,
        },
        {
          role: 'user',
          content: task,
        },
      ];

      const tools = toolRegistry.getDefinitions();
      const maxIterations = options?.maxIterations || 5;
      let iteration = 0;
      let finalContent = '';

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
              chunks.push(parsed.content || '');
            }
          } catch (e) {
            // Not JSON, treat as content
            chunks.push(chunk);
          }
        }

        const content = chunks.join('');

        if (hasToolCalls && toolCalls.length > 0) {
          // Execute tool calls
          for (const toolCall of toolCalls) {
            const result = await toolRegistry.execute({
              id: toolCall.id,
              name: toolCall.function.name,
              arguments: JSON.parse(toolCall.function.arguments),
            });

            messages.push({
              role: 'assistant',
              content: '',
              tool_calls: [toolCall],
            });

            messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: JSON.stringify(result),
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
          result: task.result,
          error: task.error,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
        };
      }

      // Check timeout
      if (timeout && Date.now() - startTime > timeout) {
        throw new Error(`Task ${taskId} timeout after ${timeout}ms`);
      }

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }
  }

  /**
   * Retry a failed task
   */
  async retryTask(taskId: string): Promise<string | null> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return null;
    }

    if (task.status !== 'failed') {
      return null;
    }

    // Create new task with same parameters
    const newTaskId = uuidv4();
    const newTask: ISubagentTask = {
      id: newTaskId,
      parentSessionId: task.parentSessionId,
      task: task.task,
      label: task.label,
      status: 'pending',
      createdAt: Date.now(),
    };

    this.tasks.set(newTaskId, newTask);

    // Note: We'd need to store the original config to retry
    // For now, this is a placeholder
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
