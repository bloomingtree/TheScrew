/**
 * Tool Registry - nanobot style tool management
 *
 * Responsibilities:
 * - Register tools
 * - Get tool definitions (OpenAI format)
 * - Execute tool calls
 * - Permission checking
 */

import { ITool, IToolCall, IToolResult, IToolExecutionContext } from './types';

/**
 * Tool Registry - central tool management
 */
export class ToolRegistry {
  private tools: Map<string, ITool> = new Map();
  private permissions: Map<string, { allow?: string[]; deny?: string[] }> = new Map();

  /**
   * Register a tool
   */
  register(tool: ITool): void {
    this.tools.set(tool.name(), tool);
    console.log(`[ToolRegistry] Registered tool: ${tool.name()}`);
  }

  /**
   * Register multiple tools
   */
  registerAll(tools: ITool[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Unregister a tool
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tools
   */
  getAll(): ITool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Check if a tool exists
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get tool definitions in OpenAI function format
   */
  getDefinitions(agentName?: string): Array<any> {
    const tools = agentName
      ? this.getToolsForAgent(agentName)
      : this.getAll();

    return tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name(),
        description: tool.description(),
        parameters: tool.parameters(),
      },
    }));
  }

  /**
   * Get tools available for a specific agent (after permission filtering)
   */
  getToolsForAgent(agentName: string): ITool[] {
    const perms = this.permissions.get(agentName);
    if (!perms) {
      return this.getAll();
    }

    const { allow, deny } = perms;

    return this.getAll().filter(tool => {
      const name = tool.name();

      // Check deny list first
      if (deny && deny.length > 0) {
        for (const pattern of deny) {
          if (this.matchPattern(name, pattern)) {
            return false;
          }
        }
      }

      // Check allow list
      if (allow && allow.length > 0) {
        for (const pattern of allow) {
          if (this.matchPattern(name, pattern)) {
            return true;
          }
        }
        return false;
      }

      return true;
    });
  }

  /**
   * Match tool name against a pattern (supports wildcards)
   */
  private matchPattern(toolName: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return toolName.startsWith(prefix);
    }
    return toolName === pattern;
  }

  /**
   * Set permissions for an agent
   */
  setPermissions(agentName: string, permissions: { allow?: string[]; deny?: string[] }): void {
    this.permissions.set(agentName, permissions);
    console.log(`[ToolRegistry] Set permissions for agent: ${agentName}`, permissions);
  }

  /**
   * Check if a tool is allowed for an agent
   */
  checkPermission(agentName: string, toolName: string): boolean {
    const perms = this.permissions.get(agentName);
    if (!perms) {
      return true; // No restrictions
    }

    const { allow, deny } = perms;

    // Check deny list first
    if (deny && deny.length > 0) {
      for (const pattern of deny) {
        if (this.matchPattern(toolName, pattern)) {
          console.log(`[ToolRegistry] Tool "${toolName}" denied by agent "${agentName}"`);
          return false;
        }
      }
    }

    // Check allow list
    if (allow && allow.length > 0) {
      for (const pattern of allow) {
        if (this.matchPattern(toolName, pattern)) {
          console.log(`[ToolRegistry] Tool "${toolName}" allowed by agent "${agentName}"`);
          return true;
        }
      }
      return false;
    }

    return true;
  }

  /**
   * Execute a single tool call
   */
  async execute(call: IToolCall, context?: IToolExecutionContext): Promise<IToolResult> {
    const tool = this.tools.get(call.name);

    if (!tool) {
      return {
        toolCallId: call.id,
        name: call.name,
        success: false,
        error: `Tool not found: ${call.name}`,
      };
    }

    // Check permissions
    if (context?.agentName && !this.checkPermission(context.agentName, call.name)) {
      return {
        toolCallId: call.id,
        name: call.name,
        success: false,
        error: `Tool "${call.name}" is not allowed for agent "${context.agentName}"`,
      };
    }

    try {
      const startTime = Date.now();
      const result = await tool.execute(call.arguments);
      const duration = Date.now() - startTime;

      console.log(`[ToolRegistry] Executed ${call.name} in ${duration}ms`);

      // Handle both string and ToolResult return types
      if (typeof result === 'string') {
        return {
          toolCallId: call.id,
          name: call.name,
          success: true,
          result,
        };
      } else if (result.success) {
        return {
          toolCallId: call.id,
          name: call.name,
          success: true,
          result: result.result,
        };
      } else {
        return {
          toolCallId: call.id,
          name: call.name,
          success: false,
          error: result.error || 'Unknown error',
        };
      }
    } catch (error: any) {
      console.error(`[ToolRegistry] Error executing ${call.name}:`, error);
      return {
        toolCallId: call.id,
        name: call.name,
        success: false,
        error: error.message || String(error),
      };
    }
  }

  /**
   * Execute multiple tool calls in parallel
   */
  async executeAll(calls: IToolCall[], context?: IToolExecutionContext): Promise<IToolResult[]> {
    return Promise.all(
      calls.map(call => this.execute(call, context))
    );
  }

  /**
   * Estimate total tokens for tool definitions
   */
  estimateTokens(toolNames?: string[]): number {
    const tools = toolNames
      ? toolNames.map(name => this.tools.get(name)).filter(Boolean) as ITool[]
      : this.getAll();

    return tools.reduce((sum, tool) => {
      return sum + (tool.estimateTokens?.() || this.estimateToolTokens(tool));
    }, 0);
  }

  /**
   * Estimate tokens for a single tool
   */
  private estimateToolTokens(tool: ITool): number {
    // Rough estimation: description + parameters
    const descLen = tool.description().length;
    const paramsLen = JSON.stringify(tool.parameters()).length;
    return Math.ceil((descLen + paramsLen) / 4);
  }

  /**
   * Get tool statistics
   */
  getStats(): {
    totalTools: number;
    totalEstimatedTokens: number;
    toolsByCategory: Record<string, number>;
  } {
    const tools = this.getAll();
    const toolsByCategory: Record<string, number> = {};

    for (const tool of tools) {
      const name = tool.name();
      const category = name.split('_')[0] || 'other';
      toolsByCategory[category] = (toolsByCategory[category] || 0) + 1;
    }

    return {
      totalTools: tools.length,
      totalEstimatedTokens: this.estimateTokens(),
      toolsByCategory,
    };
  }

  /**
   * Clear all tools (useful for testing)
   */
  clear(): void {
    this.tools.clear();
    this.permissions.clear();
    console.log('[ToolRegistry] Cleared all tools and permissions');
  }

  /**
   * Get tools by category/prefix
   */
  getByCategory(category: string): ITool[] {
    const prefix = category.toLowerCase();
    return this.getAll().filter(tool =>
      tool.name().toLowerCase().startsWith(prefix)
    );
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let toolRegistryInstance: ToolRegistry | null = null;

/**
 * Get the singleton ToolRegistry instance
 */
export function getToolRegistry(): ToolRegistry {
  if (!toolRegistryInstance) {
    toolRegistryInstance = new ToolRegistry();
  }
  return toolRegistryInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetToolRegistry(): void {
  if (toolRegistryInstance) {
    toolRegistryInstance.clear();
  }
  toolRegistryInstance = null;
}

export default ToolRegistry;
