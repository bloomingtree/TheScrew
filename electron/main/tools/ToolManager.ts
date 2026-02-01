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

  async executeToolCall(toolCall: ToolCall): Promise<ToolResult> {
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

  async executeToolCalls(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.executeToolCall(toolCall);
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
   */
  resetForConversation(conversationId: string): void {
    // 重置为只有基础工具组
    this.conversationActiveGroups.set(conversationId, new Set([ToolManager.BASE_GROUP]));
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

  /**
   * 判断是否需要加载 Word 工具
   * 基于工具调用结果来判断
   */
  shouldLoadWordTools(toolName: string, toolResult: any): boolean {
    // 情况1：调用了 read_file 且读取的是 .docx 文件
    if (toolName === 'read_file' && toolResult.success) {
      const filepath = toolResult.path || '';
      if (filepath.toLowerCase().endsWith('.docx') || filepath.toLowerCase().endsWith('.doc')) {
        return true;
      }
    }

    // 情况2：search_files 或 search_in_files 结果中包含 .docx 文件
    if (['search_files', 'search_in_files', 'list_directory'].includes(toolName)) {
      const resultStr = JSON.stringify(toolResult);
      if (resultStr.toLowerCase().includes('.docx') || resultStr.toLowerCase().includes('.doc')) {
        return true;
      }
    }

    return false;
  }

  // Word 相关关键词常量
  private static readonly WORD_KEYWORDS = [
    'word', '文档', '.docx', 'docx', 'ms word', 'microsoft word',
    '编辑', '页眉', '页脚', '段落', '表格', '替换',
    '新建文档', '创建文档', '打开文档', '保存文档',
    '插入图片', '插入表格', '导出', 'html',
  ];

  /**
   * 检测用户消息并返回需要激活的工具组
   */
  detectRequiredGroups(userMessage: string): string[] {
    const groups: string[] = [];

    if (!userMessage) {
      return groups;
    }

    const lowerMessage = userMessage.toLowerCase();

    // 检测 Word 关键词
    for (const keyword of ToolManager.WORD_KEYWORDS) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        groups.push('word');
        break;
      }
    }

    // 检测文件扩展名
    const extPattern = /\.\w{3,4}/gi;
    const matches = lowerMessage.match(extPattern) || [];

    for (const ext of matches) {
      const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;
      if (normalizedExt === '.docx' || normalizedExt === '.doc') {
        if (!groups.includes('word')) {
          groups.push('word');
        }
      }
    }

    return groups;
  }

  /**
   * 获取工具组的关键词列表（用于配置）
   */
  static getGroupKeywords(groupName: string): string[] {
    switch (groupName) {
      case 'word':
        return [...ToolManager.WORD_KEYWORDS];
      default:
        return [];
    }
  }
}

export const toolManager = new ToolManager();