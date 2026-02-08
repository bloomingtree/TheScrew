/**
 * Adapters for compatibility with existing tools
 *
 * This module provides adapters to bridge the gap between:
 * - Legacy Tool interface (from ToolManager)
 * - New ITool interface (from core/types.ts)
 */

import { ITool, ToolResult } from './types';
import { Tool } from '../tools/ToolManager';

/**
 * Adapter to convert legacy Tool to ITool interface
 */
export class ToolAdapter implements ITool {
  private toolName: string;
  private toolDescription: string;
  private toolParameters: Record<string, any>;
  private toolHandler: (args: any) => Promise<any>;

  constructor(tool: Tool) {
    this.toolName = tool.name;
    this.toolDescription = tool.description;
    this.toolParameters = tool.parameters;
    this.toolHandler = tool.handler;
  }

  name(): string {
    return this.toolName;
  }

  description(): string {
    return this.toolDescription;
  }

  parameters(): Record<string, any> {
    return this.toolParameters;
  }

  async execute(args: Record<string, any>): Promise<string | ToolResult> {
    try {
      const result = await this.toolHandler(args);
      // Handle both object and primitive results
      if (typeof result === 'object' && 'success' in result) {
        return result as ToolResult;
      }
      return JSON.stringify(result);
    } catch (error: any) {
      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  estimateTokens(): number {
    const descLen = this.toolDescription.length;
    const paramsLen = JSON.stringify(this.toolParameters).length;
    return Math.ceil((descLen + paramsLen) / 4);
  }
}

/**
 * Adapt a single tool
 */
export function adaptTool(tool: Tool): ITool {
  return new ToolAdapter(tool);
}

/**
 * Adapt multiple tools
 */
export function adaptTools(tools: Tool[]): ITool[] {
  return tools.map(tool => new ToolAdapter(tool));
}

/**
 * Create an ITool from simple parameters
 * Useful for creating inline tools without defining a class
 */
export function createSimpleTool(config: {
  name: string;
  description: string;
  parameters: Record<string, any>;
  handler: (args: any) => Promise<any>;
}): ITool {
  return new ToolAdapter({
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    handler: config.handler,
  });
}

/**
 * Tool group adapter - adapts tools from a tool group
 */
export class ToolGroupAdapter {
  private tools: Map<string, ITool> = new Map();

  constructor(tools: Tool[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, new ToolAdapter(tool));
    }
  }

  getTool(name: string): ITool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): ITool[] {
    return Array.from(this.tools.values());
  }

  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  hasTool(name: string): boolean {
    return this.tools.has(name);
  }
}

/**
 * Create a tool group adapter
 */
export function adaptToolGroup(tools: Tool[]): ToolGroupAdapter {
  return new ToolGroupAdapter(tools);
}

/**
 * Reverse adapter - convert ITool back to legacy Tool format
 * Useful when integrating with existing code that expects Tool interface
 */
export function itoolToTool(itool: ITool): Tool {
  return {
    name: itool.name(),
    description: itool.description(),
    parameters: itool.parameters() as Tool['parameters'],
    handler: async (args: any) => {
      const result = await itool.execute(args);
      if (typeof result === 'string') {
        try {
          return JSON.parse(result);
        } catch {
          return result;
        }
      }
      return result;
    },
  };
}

/**
 * Batch convert ITools to legacy Tools
 */
export function itoolsToTools(itools: ITool[]): Tool[] {
  return itools.map(itool => itoolToTool(itool));
}

/**
 * Tool registry adapter - bridges between ToolRegistry and ToolManager
 */
export class ToolRegistryAdapter {
  private toolManager: any; // ToolManager (avoid circular import)

  constructor(toolManager: any) {
    this.toolManager = toolManager;
  }

  /**
   * Get all tools from ToolManager as ITools
   */
  getAllToolsAsITools(): ITool[] {
    const tools = this.toolManager.getAllTools();
    return adaptTools(tools);
  }

  /**
   * Get a specific tool as ITool
   */
  getToolAsITool(name: string): ITool | undefined {
    const tool = this.toolManager.getTool(name);
    return tool ? new ToolAdapter(tool) : undefined;
  }

  /**
   * Register an ITool with ToolManager
   */
  registerITool(itool: ITool): void {
    const tool = itoolToTool(itool);
    this.toolManager.registerTool(tool);
  }

  /**
   * Register multiple ITools with ToolManager
   */
  registerITools(itools: ITool[]): void {
    for (const itool of itools) {
      this.registerITool(itool);
    }
  }

  /**
   * Get active tool definitions for a conversation
   */
  getActiveToolDefinitions(conversationId?: string): any[] {
    return this.toolManager.getActiveToolDefinitions(conversationId);
  }

  /**
   * Activate a tool group for a conversation
   */
  activateToolGroup(groupName: string, conversationId: string): void {
    this.toolManager.activateGroup(groupName, conversationId);
  }

  /**
   * Deactivate a tool group for a conversation
   */
  deactivateToolGroup(groupName: string, conversationId: string): void {
    this.toolManager.deactivateGroup(groupName, conversationId);
  }

  /**
   * Reset tool groups for a conversation
   */
  resetForConversation(conversationId: string): void {
    this.toolManager.resetForConversation(conversationId);
  }

  /**
   * Get tool sets overview
   */
  getToolSetsOverview(conversationId?: string): any[] {
    return this.toolManager.getToolSetsOverview(conversationId);
  }

  /**
   * Activate a tool set
   */
  async activateToolSet(conversationId: string, toolSetName: string): Promise<any> {
    return this.toolManager.activateToolSet(conversationId, toolSetName);
  }

  /**
   * Get active groups
   */
  getActiveGroups(conversationId: string): string[] {
    return this.toolManager.getActiveGroups(conversationId);
  }

  /**
   * Estimate active tokens
   */
  estimateActiveTokens(conversationId: string): number {
    return this.toolManager.estimateActiveTokens(conversationId);
  }

  /**
   * Detect required groups from message
   */
  detectRequiredGroups(message: string): string[] {
    return this.toolManager.detectRequiredGroups(message);
  }

  /**
   * Set agent for conversation
   */
  setAgent(conversationId: string, agentName: string): void {
    this.toolManager.setAgent(conversationId, agentName);
  }

  /**
   * Get agent for conversation
   */
  getAgent(conversationId: string): string | undefined {
    return this.toolManager.getAgent(conversationId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): any[] {
    return this.toolManager.getAllAgents();
  }
}

/**
 * Create a ToolRegistryAdapter
 */
export function createToolRegistryAdapter(toolManager: any): ToolRegistryAdapter {
  return new ToolRegistryAdapter(toolManager);
}

/**
 * Composed tool - combines multiple tools into one
 * Useful for creating compound tools
 */
export class ComposedTool implements ITool {
  private _name: string;
  private _description: string;
  private tools: ITool[];
  private combiner: (results: (string | ToolResult)[]) => string | ToolResult;

  constructor(config: {
    name: string;
    description: string;
    tools: ITool[];
    combiner: (results: (string | ToolResult)[]) => string | ToolResult;
  }) {
    this._name = config.name;
    this._description = config.description;
    this.tools = config.tools;
    this.combiner = config.combiner;
  }

  name(): string {
    return this._name;
  }

  description(): string {
    return this._description;
  }

  parameters(): Record<string, any> {
    // Composed tools accept any properties
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    };
  }

  async execute(args: Record<string, any>): Promise<string | ToolResult> {
    const results: (string | ToolResult)[] = [];

    for (const tool of this.tools) {
      try {
        const result = await tool.execute(args);
        results.push(result);
      } catch (error: any) {
        results.push({
          success: false,
          error: error.message || String(error),
        });
      }
    }

    return this.combiner(results);
  }

  estimateTokens(): number {
    return this.tools.reduce((sum, tool) => sum + (tool.estimateTokens?.() || 200), 0);
  }
}

/**
 * Create a composed tool
 */
export function createComposedTool(config: {
  name: string;
  description: string;
  tools: ITool[];
  combiner: (results: (string | ToolResult)[]) => string | ToolResult;
}): ITool {
  return new ComposedTool(config);
}

/**
 * Fallback tool - tries multiple tools until one succeeds
 */
export class FallbackTool implements ITool {
  private _name: string;
  private _description: string;
  private _parameters: Record<string, any>;
  private tools: ITool[];

  constructor(config: {
    name: string;
    description: string;
    parameters?: Record<string, any>;
    tools: ITool[];
  }) {
    this._name = config.name;
    this._description = config.description;
    this._parameters = config.parameters || {
      type: 'object',
      properties: {},
      additionalProperties: true,
    };
    this.tools = config.tools;
  }

  name(): string {
    return this._name;
  }

  description(): string {
    return this._description;
  }

  parameters(): Record<string, any> {
    return this._parameters;
  }

  async execute(args: Record<string, any>): Promise<string | ToolResult> {
    const errors: string[] = [];

    for (const tool of this.tools) {
      try {
        const result = await tool.execute(args);

        // Check if result indicates success
        if (typeof result === 'string') {
          return result;
        } else if (result.success) {
          return result;
        } else if (result.error) {
          errors.push(`${tool.name()}: ${result.error}`);
        }
      } catch (error: any) {
        errors.push(`${tool.name()}: ${error.message || String(error)}`);
      }
    }

    return {
      success: false,
      error: `All tools failed. Errors: ${errors.join('; ')}`,
    };
  }

  estimateTokens(): number {
    return this.tools.reduce((sum, tool) => sum + (tool.estimateTokens?.() || 200), 0);
  }
}

/**
 * Create a fallback tool
 */
export function createFallbackTool(config: {
  name: string;
  description: string;
  parameters?: Record<string, any>;
  tools: ITool[];
}): ITool {
  return new FallbackTool(config);
}

export default {
  ToolAdapter,
  adaptTool,
  adaptTools,
  createSimpleTool,
  ToolGroupAdapter,
  adaptToolGroup,
  itoolToTool,
  itoolsToTools,
  ToolRegistryAdapter,
  createToolRegistryAdapter,
  ComposedTool,
  createComposedTool,
  FallbackTool,
  createFallbackTool,
};
