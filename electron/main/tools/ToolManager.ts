export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (args: any) => Promise<any>;
}

/**
 * 工具集元数据 - 用于工具集概览和懒加载
 */
export interface ToolSetMeta {
  name: string;
  description: string;
  capabilities: string[];
  keywords: string[];
  estimatedTokens: number;
}

/**
 * 工具集元数据配置
 * 每个工具集的概览信息，始终暴露给大模型
 *
 * Note: Office tool sets (word, pptx, xlsx, pdf, batch, template, ooxml) have been removed
 * to align with nanobot's simplified tool specification.
 */
export const TOOL_SETS_META: ToolSetMeta[] = [
  // Office tool sets removed - only core tools remain
];

/**
 * 动态导入的工具集元数据（在 index.ts 中添加）
 */
export interface DynamicToolSetMeta {
  name: string;
  description: string;
  capabilities: string[];
  keywords: string[];
  estimatedTokens: number;
}

/**
 * 注册动态工具集元数据
 * 用于在运行时添加工具集元数据（避免循环导入）
 */
const dynamicToolSets: DynamicToolSetMeta[] = [];

export function registerToolSetMeta(meta: DynamicToolSetMeta): void {
  // 检查是否已存在
  const existingIndex = TOOL_SETS_META.findIndex(ts => ts.name === meta.name);
  if (existingIndex === -1) {
    TOOL_SETS_META.push(meta as ToolSetMeta);
    console.log(`[ToolManager] Registered tool set meta: ${meta.name}`);
  }
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  success: boolean;
  result?: any;
  error?: string;
}

/**
 * 工具组定义 - 用于按需加载工具
 */
export interface ToolGroup {
  name: string;
  description?: string;
  tools: Tool[];
  keywords: string[];
  triggers: {
    keywords: string[];
    fileExtensions: string[];
    dependentTools: string[];
  };
}

export class ToolManager {
  private tools: Map<string, Tool> = new Map();

  // 工具组管理
  private toolGroups: Map<string, ToolGroup> = new Map();
  private activeGroups: Set<string> = new Set(); // 全局激活的工具组（用于无对话Id的场景）
  private conversationActiveGroups: Map<string, Set<string>> = new Map(); // 每个对话的激活工具组

  // 基础工具集名称
  private static readonly BASE_GROUP = 'base';

  constructor() {
    // Office Skills 现在由新的 SkillManager 管理
  }

  /**
   * 初始化工具管理器
   * Office Skills 现在由新的 SkillManager 管理
   */
  async initialize(): Promise<void> {
    // 初始化完成，不再加载 Agents
    console.log('[ToolManager] Initialized');
  }

  registerTool(tool: Tool): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * 注册工具组
   */
  registerToolGroup(group: ToolGroup): void {
    this.toolGroups.set(group.name, group);

    // 将工具组中的工具注册到工具映射中
    for (const tool of group.tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * 注销工具组
   */
  unregisterToolGroup(name: string): void {
    const group = this.toolGroups.get(name);
    if (group) {
      for (const tool of group.tools) {
        this.tools.delete(tool.name);
      }
      this.toolGroups.delete(name);
    }
  }

  unregisterTool(name: string): void {
    this.tools.delete(name);
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): Tool[] {
    return Array.from(this.tools.values());
  }

  getOpenAIFunctionDefinitions(): any[] {
    return Array.from(this.tools.values()).map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  async executeToolCall(toolCall: ToolCall, conversationId?: string): Promise<ToolResult> {
    const tool = this.tools.get(toolCall.function.name);

    if (!tool) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.function.name,
        success: false,
        error: `Tool not found: ${toolCall.function.name}`,
      };
    }

    try {
      let args: any;
      try {
        args = JSON.parse(toolCall.function.arguments);
      } catch (e) {
        args = {};
      }

      // 将 toolCallId 传递给 handler（用于输出截断时的文件名）
      const argsWithId = { ...args, _toolCallId: toolCall.id };
      const result = await tool.handler(argsWithId);
      return {
        toolCallId: toolCall.id,
        name: toolCall.function.name,
        success: true,
        result,
      };
    } catch (error: any) {
      return {
        toolCallId: toolCall.id,
        name: toolCall.function.name,
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  async executeToolCalls(toolCalls: ToolCall[], conversationId?: string): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeToolCall(toolCall, conversationId);
      results.push(result);
    }

    return results;
  }

  /**
   * 激活工具组（为指定对话）
   */
  activateGroup(groupName: string, conversationId?: string): void {
    if (conversationId) {
      if (!this.conversationActiveGroups.has(conversationId)) {
        this.conversationActiveGroups.set(conversationId, new Set([ToolManager.BASE_GROUP]));
      }
      this.conversationActiveGroups.get(conversationId)!.add(groupName);
    } else {
      this.activeGroups.add(groupName);
    }
  }

  /**
   * 停用工具组（为指定对话）
   */
  deactivateGroup(groupName: string, conversationId?: string): void {
    if (conversationId) {
      const groups = this.conversationActiveGroups.get(conversationId);
      if (groups) {
        groups.delete(groupName);
      }
    } else {
      this.activeGroups.delete(groupName);
    }
  }

  /**
   * 重置指定对话的工具组状态
   * 注意：现在使用懒加载模式，不再预激活所有工具组
   * 只激活 base 工具组，其他工具集需要通过 activate_toolset 激活
   */
  resetForConversation(conversationId: string): void {
    // 默认只激活 base 工具组
    const defaultGroups = new Set([ToolManager.BASE_GROUP]);

    this.conversationActiveGroups.set(conversationId, defaultGroups);
    console.log(`[ToolManager] Reset conversation ${conversationId} with groups:`, Array.from(defaultGroups));
  }

  // ==================== 工具集懒加载 ====================

  /**
   * 获取工具集概览（轻量级，始终暴露）
   * 用于向大模型展示可用的工具集列表
   */
  getToolSetsOverview(_conversationId?: string): ToolSetMeta[] {
    return TOOL_SETS_META;
  }

  /**
   * 激活工具集（由大模型按需调用）
   * 返回激活的工具集的详细工具定义
   */
  async activateToolSet(conversationId: string, toolSetName: string): Promise<{
    success: boolean;
    tools?: any[];
    message?: string;
  }> {
    // 检查工具集是否存在
    const toolSetMeta = TOOL_SETS_META.find(ts => ts.name === toolSetName);
    if (!toolSetMeta) {
      return {
        success: false,
        message: `工具集 "${toolSetName}" 不存在。可用工具集: ${TOOL_SETS_META.map(ts => ts.name).join(', ')}`
      };
    }

    // 激活工具组
    const activeGroups = this.conversationActiveGroups.get(conversationId) || new Set([ToolManager.BASE_GROUP]);
    activeGroups.add(toolSetName);
    this.conversationActiveGroups.set(conversationId, activeGroups);

    // 获取该工具集的详细工具定义
    const toolGroup = this.toolGroups.get(toolSetName);
    const tools = toolGroup ? toolGroup.tools : [];

    console.log(`[ToolManager] Activated tool set "${toolSetName}" for conversation ${conversationId}, tools count: ${tools.length}`);

    return {
      success: true,
      tools: tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      message: `已激活 "${toolSetName}" 工具集，包含 ${tools.length} 个工具`
    };
  }

  /**
   * 获取当前激活的工具组名称列表
   */
  getActiveGroups(conversationId: string): string[] {
    const groups = this.conversationActiveGroups.get(conversationId);
    return groups ? Array.from(groups) : [ToolManager.BASE_GROUP];
  }

  /**
   * 估算当前活跃工具集的总 token 数
   */
  estimateActiveTokens(conversationId: string): number {
    const activeGroups = this.conversationActiveGroups.get(conversationId) || new Set([ToolManager.BASE_GROUP]);

    let total = 200; // base 工具集约 200 tokens

    for (const groupName of activeGroups) {
      if (groupName === ToolManager.BASE_GROUP) continue;
      const meta = TOOL_SETS_META.find(ts => ts.name === groupName);
      if (meta) {
        total += meta.estimatedTokens;
      }
    }

    return total;
  }

  /**
   * 获取指定对话当前激活的工具组的工具定义
   */
  getActiveToolDefinitions(conversationId?: string): any[] {
    const activeGroups = conversationId
      ? this.conversationActiveGroups.get(conversationId) || this.activeGroups
      : this.activeGroups;

    if (activeGroups.size === 0) {
      // 如果没有激活的工具组，返回基础工具
      return this.getBaseToolDefinitions();
    }

    const definitions: any[] = [];

    for (const groupName of activeGroups) {
      const group = this.toolGroups.get(groupName);
      if (group) {
        for (const tool of group.tools) {
          definitions.push({
            type: 'function',
            function: {
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            },
          });
        }
      }
    }

    return definitions;
  }

  /**
   * 获取基础工具集的定义
   */
  private getBaseToolDefinitions(): any[] {
    const baseGroup = this.toolGroups.get(ToolManager.BASE_GROUP);
    if (!baseGroup) {
      return [];
    }

    return baseGroup.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}

export const toolManager = new ToolManager();

/**
 * Get the ToolManager singleton instance
 */
export function getToolManager(): ToolManager {
  return toolManager;
}