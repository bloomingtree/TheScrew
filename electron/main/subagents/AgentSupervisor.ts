/**
 * Agent Supervisor - Multi-Agent Collaboration Coordinator
 *
 * Based on the DeerFlow pattern for multi-agent task orchestration.
 * Coordinates multiple sub-agents to work on a decomposed plan with:
 * - Dependency analysis (parallel vs sequential execution)
 * - Context injection from predecessor tasks
 * - Progress reporting
 * - Simple result synthesis
 *
 * Usage:
 *   The supervisor is designed to be invoked from the main chat loop
 *   when the LLM determines a task needs multi-agent collaboration.
 *   IPC and frontend integration will be added in a later phase.
 */

import { SubagentManager, SubagentResult, SubAgentConfig } from './SubagentManager';

/**
 * A single sub-task within a multi-agent plan
 */
export interface SubTask {
  /** Unique identifier for this sub-task */
  id: string;
  /** Which agent type should handle this task */
  agentType: 'default' | 'devops' | 'office' | 'secretary';
  /** The task description */
  task: string;
  /** Tool whitelist override (if omitted, agent's default tools are used) */
  allowedTools?: string[];
  /** Additional system prompt for this specific task */
  systemPromptAddon?: string;
  /** Maximum LLM iteration rounds */
  maxIterations?: number;
  /** IDs of tasks that must complete before this one can start */
  dependencies?: string[];
}

/**
 * Result of a single sub-task execution
 */
export interface SubTaskResult {
  /** The sub-task ID */
  taskId: string;
  /** Final status */
  status: 'completed' | 'failed' | 'timeout';
  /** The result content */
  content: string;
  /** Tool calls made during execution (optional) */
  toolCalls?: any[];
}

/**
 * Progress update emitted during plan execution
 */
export interface ProgressUpdate {
  /** Type of progress event */
  type: 'plan' | 'task_start' | 'task_progress' | 'task_complete' | 'task_failed' | 'synthesis';
  /** The sub-task ID (for task_* events) */
  taskId?: string;
  /** Description or content of the progress */
  content?: string;
  /** Agent type handling this task */
  agentType?: string;
}

/**
 * Agent Supervisor - coordinates multi-agent plan execution
 *
 * Flow:
 * 1. Receive a plan (array of SubTasks) and the original user request
 * 2. Analyze dependencies to determine parallel vs sequential tasks
 * 3. Execute tasks without dependencies in parallel (Promise.all)
 * 4. Execute tasks with dependencies sequentially, injecting predecessor results
 * 5. Synthesize all results into a final response
 */
export class AgentSupervisor {
  private subagentManager: SubagentManager;

  constructor(subagentManager: SubagentManager) {
    this.subagentManager = subagentManager;
  }

  /**
   * Execute a multi-agent plan
   *
   * @param userRequest - The original user request (used for context and synthesis)
   * @param plan - Array of sub-tasks to execute
   * @param llmConfig - LLM configuration for sub-agents
   * @param onProgress - Optional progress callback
   * @returns Synthesized result and individual task results
   */
  async executePlan(
    userRequest: string,
    plan: SubTask[],
    llmConfig: {
      baseUrl: string;
      apiKey: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    },
    onProgress?: (update: ProgressUpdate) => void,
  ): Promise<{ synthesis: string; results: SubTaskResult[] }> {
    if (!plan || plan.length === 0) {
      return { synthesis: '', results: [] };
    }

    const results = new Map<string, SubTaskResult>();

    // Notify plan start
    onProgress?.({
      type: 'plan',
      content: `执行计划: ${plan.map((t, i) => `${i + 1}. [${t.agentType}] ${t.task}`).join('\n')}`,
    });

    // Analyze dependencies and group tasks
    const { parallel, sequential, dependencyMap } = this.analyzeDependencies(plan);

    // Execute parallel tasks (no dependencies)
    if (parallel.length > 0) {
      onProgress?.({
        type: 'plan',
        content: `并行执行 ${parallel.length} 个独立任务...`,
      });

      const parallelResults = await Promise.all(
        parallel.map(task => this.runSubTask(task, llmConfig, onProgress))
      );
      for (const result of parallelResults) {
        results.set(result.taskId, result);
      }
    }

    // Execute sequential tasks (have dependencies)
    if (sequential.length > 0) {
      onProgress?.({
        type: 'plan',
        content: `按顺序执行 ${sequential.length} 个有依赖的任务...`,
      });

      // Sort sequential tasks by dependency order (topological)
      const sortedSequential = this.topologicalSort(sequential, dependencyMap);

      for (const task of sortedSequential) {
        // Check if all dependencies are completed
        const depsReady = this.checkDependenciesReady(task, results);
        if (!depsReady) {
          const failedResult: SubTaskResult = {
            taskId: task.id,
            status: 'failed',
            content: `前置任务未完成，跳过任务: ${task.id}`,
          };
          results.set(task.id, failedResult);

          onProgress?.({
            type: 'task_failed',
            taskId: task.id,
            content: failedResult.content,
            agentType: task.agentType,
          });
          continue;
        }

        // Inject previous results as context
        const previousResults = task.dependencies!
          .map(depId => results.get(depId))
          .filter((r): r is SubTaskResult => r !== undefined && r.status === 'completed');

        const contextAddon = previousResults.length > 0
          ? `\n\n## 前置任务结果\n${previousResults.map(r => `### ${r.taskId}\n${r.content}`).join('\n\n')}`
          : '';

        const enhancedTask: SubTask = {
          ...task,
          systemPromptAddon: (task.systemPromptAddon || '') + contextAddon,
        };

        const result = await this.runSubTask(enhancedTask, llmConfig, onProgress);
        results.set(task.id, result);
      }
    }

    // Synthesize results
    const allResults = Array.from(results.values());
    const synthesis = await this.synthesizeResults(userRequest, allResults, onProgress);

    return { synthesis, results: allResults };
  }

  /**
   * Run a single sub-task via the SubagentManager
   */
  private async runSubTask(
    task: SubTask,
    llmConfig: {
      baseUrl: string;
      apiKey: string;
      model: string;
      temperature?: number;
      maxTokens?: number;
    },
    onProgress?: (update: ProgressUpdate) => void,
  ): Promise<SubTaskResult> {
    onProgress?.({
      type: 'task_start',
      taskId: task.id,
      agentType: task.agentType,
      content: task.task,
    });

    try {
      const taskId = await this.subagentManager.spawn(
        task.task,
        `[Supervisor] ${task.agentType} task`,
        `supervisor-${Date.now()}`,
        {
          baseUrl: llmConfig.baseUrl,
          apiKey: llmConfig.apiKey,
          model: llmConfig.model,
          temperature: llmConfig.temperature,
          maxTokens: llmConfig.maxTokens,
        },
        {
          agentType: task.agentType,
          allowedTools: task.allowedTools,
          maxIterations: task.maxIterations || 5,
          systemPromptAddon: task.systemPromptAddon,
          onChunk: (chunk) => {
            onProgress?.({
              type: 'task_progress',
              taskId: task.id,
              content: chunk,
            });
          },
        } satisfies SubAgentConfig,
      );

      // Wait for completion with a 2-minute timeout
      const result: SubagentResult = await this.subagentManager.waitForTask(taskId, 120000);

      const isCompleted = result.status === 'completed';
      const isTimedOut = result.status === 'failed' && result.error?.includes('timeout');

      onProgress?.({
        type: isCompleted ? 'task_complete' : 'task_failed',
        taskId: task.id,
        content: result.content || result.error || '',
      });

      return {
        taskId: task.id,
        status: isCompleted ? 'completed' : (isTimedOut ? 'timeout' : 'failed'),
        content: result.content || result.result || result.error || '',
      };
    } catch (error: any) {
      const isTimeout = error.message?.includes('timeout');
      onProgress?.({
        type: 'task_failed',
        taskId: task.id,
        content: error.message,
        agentType: task.agentType,
      });

      return {
        taskId: task.id,
        status: isTimeout ? 'timeout' : 'failed',
        content: error.message || 'Unknown error',
      };
    }
  }

  /**
   * Analyze task dependencies
   *
   * Returns:
   * - parallel: tasks with no dependencies (can run simultaneously)
   * - sequential: tasks with dependencies (must wait for predecessors)
   * - dependencyMap: for each task ID, which tasks it depends on
   */
  private analyzeDependencies(tasks: SubTask[]): {
    parallel: SubTask[];
    sequential: SubTask[];
    dependencyMap: Map<string, string[]>;
  } {
    const parallel: SubTask[] = [];
    const sequential: SubTask[] = [];
    const dependencyMap = new Map<string, string[]>();

    for (const task of tasks) {
      const deps = task.dependencies || [];
      dependencyMap.set(task.id, deps);

      if (deps.length === 0) {
        parallel.push(task);
      } else {
        sequential.push(task);
      }
    }

    return { parallel, sequential, dependencyMap };
  }

  /**
   * Topological sort of sequential tasks based on dependencies
   *
   * Ensures tasks are executed in the correct order:
   * if task B depends on task A, A comes before B in the result.
   */
  private topologicalSort(tasks: SubTask[], dependencyMap: Map<string, string[]>): SubTask[] {
    const taskMap = new Map(tasks.map(t => [t.id, t]));
    const visited = new Set<string>();
    const result: SubTask[] = [];

    const visit = (taskId: string) => {
      if (visited.has(taskId)) return;
      visited.add(taskId);

      const deps = dependencyMap.get(taskId) || [];
      for (const depId of deps) {
        if (taskMap.has(depId)) {
          visit(depId);
        }
      }

      const task = taskMap.get(taskId);
      if (task) {
        result.push(task);
      }
    };

    for (const task of tasks) {
      visit(task.id);
    }

    return result;
  }

  /**
   * Check if all dependencies of a task are completed
   */
  private checkDependenciesReady(task: SubTask, results: Map<string, SubTaskResult>): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    return task.dependencies.every(depId => {
      const depResult = results.get(depId);
      return depResult && depResult.status === 'completed';
    });
  }

  /**
   * Synthesize results from all sub-tasks
   *
   * For Phase 3, this uses simple concatenation.
   * LLM-based synthesis can be added in a later phase.
   */
  private async synthesizeResults(
    userRequest: string,
    results: SubTaskResult[],
    onProgress?: (update: ProgressUpdate) => void,
  ): Promise<string> {
    onProgress?.({
      type: 'synthesis',
      content: '正在综合分析所有子任务结果...',
    });

    // Separate completed results from failures
    const completed = results.filter(r => r.status === 'completed' && r.content);
    const failures = results.filter(r => r.status !== 'completed');

    const parts: string[] = [];

    if (completed.length > 0) {
      for (const r of completed) {
        parts.push(`### ${r.taskId}\n${r.content}`);
      }
    }

    if (failures.length > 0) {
      parts.push('\n### 未完成的任务');
      for (const f of failures) {
        parts.push(`- **${f.taskId}** (${f.status}): ${f.content}`);
      }
    }

    if (parts.length === 0) {
      return '所有子任务均未产生有效结果。';
    }

    return parts.join('\n\n');
  }
}
