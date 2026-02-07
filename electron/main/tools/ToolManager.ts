import { OfficeSkillManager } from '../runtime/OfficeSkillManager';
import { getAgentManager } from '../agents/AgentManager';

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
 */
export const TOOL_SETS_META: ToolSetMeta[] = [
  {
    name: 'word',
    description: 'Word 文档处理：创建、编辑、修订跟踪、批注、验证',
    capabilities: [
      'create_document - 从 HTML 创建 Word 文档',
      'edit_document - OOXML 直接编辑，支持修订跟踪',
      'add_comment - 添加批注和回复',
      'validate_document - 验证文档结构和完整性',
      'extract_text - 提取文档文本内容'
    ],
    keywords: ['word', 'docx', '文档', 'word文档', 'doc', 'ms word', 'microsoft word'],
    estimatedTokens: 1300
  },
  {
    name: 'pptx',
    description: 'PowerPoint 演示文稿：创建、重排幻灯片、批量替换、缩略图',
    capabilities: [
      'create_presentation - 从大纲或 HTML 创建 PPT',
      'rearrange_slides - 重排、复制、删除幻灯片',
      'replace_text - 批量替换幻灯片文本',
      'generate_thumbnails - 生成幻灯片缩略图网格',
      'extract_content - 提取演示文稿内容'
    ],
    keywords: ['pptx', 'ppt', 'powerpoint', '演示文稿', '幻灯片', 'slides', 'presentation'],
    estimatedTokens: 1200
  },
  {
    name: 'xlsx',
    description: 'Excel 表格处理：读取、编辑、公式计算、样式处理',
    capabilities: [
      'read_spreadsheet - 读取表格数据和公式',
      'edit_cell - 编辑单元格内容',
      'recalc_formulas - 重新计算公式',
      'apply_style - 应用单元格样式'
    ],
    keywords: ['xlsx', 'excel', 'xls', '表格', 'spreadsheet', '工作簿', 'sheet'],
    estimatedTokens: 900
  },
  {
    name: 'pdf',
    description: 'PDF 操作：合并、拆分、表单填充、表格提取',
    capabilities: [
      'merge_pdfs - 合并多个 PDF',
      'split_pdf - 拆分 PDF 页面',
      'fill_form - 填充 PDF 表单',
      'extract_tables - 提取表格到 Excel'
    ],
    keywords: ['pdf', 'acrobat', '表单', 'form'],
    estimatedTokens: 800
  },
  {
    name: 'batch',
    description: '批量处理：批量替换、批量创建、批量操作',
    capabilities: [
      'batch_replace - 批量替换多个文件中的文本',
      'batch_create - 从模板批量创建文档',
      'batch_operation - 自定义批量操作'
    ],
    keywords: ['batch', '批量', 'bulk', '多文件', 'all files'],
    estimatedTokens: 700
  },
  {
    name: 'template',
    description: '模板系统：Word 模板、提示词模板、助手工具模板',
    capabilities: [
      'use_word_template - 使用 Word 模板生成文档',
      'apply_prompt_template - 应用提示词模板',
      'use_assistant - 使用助手工具模板'
    ],
    keywords: ['template', '模板', 'templating'],
    estimatedTokens: 600
  },
  {
    name: 'ooxml',
    description: 'OOXML 验证：验证和修复 Office 文档结构',
    capabilities: [
      'validate_document - 验证文档结构',
      'repair_document - 修复损坏的文档',
      'check_integrity - 检查文档完整性'
    ],
    keywords: ['validate', 'validation', 'verify', 'repair', 'fix', '验证', '校验', '修复'],
    estimatedTokens: 500
  }
];

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

  // Office Skills 管理
  private officeSkillManager: OfficeSkillManager;

  // Agent 管理
  private agentManager = getAgentManager();

  // 当前激活的 Agent（按对话 ID）
  private conversationAgents: Map<string, string> = new Map();

  // 基础工具集名称
  private static readonly BASE_GROUP = 'base';

  constructor() {
    // Runtime 目录在源码 electron/main/runtime/office
    // 需要使用相对于项目根目录的路径
    const isDev = process.env.NODE_ENV === 'development' || !__dirname.includes('dist-electron');

    let skillsPath: string;
    if (isDev) {
      // 开发环境：从 electron/main/ 往上一级到项目根，然后进入 runtime/office
      skillsPath = require('path').resolve(process.cwd(), 'electron', 'main', 'runtime', 'office');
    } else {
      // 生产环境：使用 resources 目录或打包后的路径
      skillsPath = require('path').join(__dirname, '..', 'runtime', 'office');
    }

    this.officeSkillManager = new OfficeSkillManager(skillsPath);
  }

  /**
   * 初始化工具管理器，加载 Office Skills 和 Agents
   */
  async initialize(): Promise<void> {
    await this.officeSkillManager.loadAllSkills();
    console.log('Office Skills loaded:', this.officeSkillManager.getAllSkills().map(s => s.category));

    await this.agentManager.loadAllAgents();
    console.log('Agents loaded:', this.agentManager.getAllAgents().map(a => a.name));
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

    // 检查 Agent 权限
    if (conversationId) {
      const agentName = this.conversationAgents.get(conversationId);
      if (agentName && !this.agentManager.checkPermission(agentName, toolCall.function.name)) {
        console.log(`Tool "${toolCall.function.name}" denied by agent "${agentName}"`);
        return {
          toolCallId: toolCall.id,
          name: toolCall.function.name,
          success: false,
          error: `Tool "${toolCall.function.name}" is not allowed by agent "${agentName}"`,
        };
      }
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
    // 获取对话的 Agent
    const agent = this.conversationAgents.get(conversationId);

    // 默认只激活 base 工具组
    const defaultGroups = new Set([ToolManager.BASE_GROUP]);

    // TODO: 未来可以根据 Agent 配置预激活某些工具集
    // 但现在使用纯懒加载模式，由大模型按需激活

    this.conversationActiveGroups.set(conversationId, defaultGroups);
    console.log(`[ToolManager] Reset conversation ${conversationId} with agent '${agent || 'default'}' and groups:`, Array.from(defaultGroups));
  }

  // ==================== 工具集懒加载 ====================

  /**
   * 获取工具集概览（轻量级，始终暴露）
   * 用于向大模型展示可用的工具集列表
   */
  getToolSetsOverview(conversationId?: string): ToolSetMeta[] {
    const agentName = conversationId ? this.conversationAgents.get(conversationId) : undefined;
    const agent = agentName ? this.agentManager.getAgent(agentName) : undefined;

    return TOOL_SETS_META.filter(toolSet => {
      return this.checkAgentToolSetPermission(agent, toolSet.name);
    });
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

    // 检查 Agent 权限
    const agentName = this.conversationAgents.get(conversationId);
    const agent = agentName ? this.agentManager.getAgent(agentName) : undefined;
    if (agent && !this.checkAgentToolSetPermission(agent, toolSetName)) {
      return {
        success: false,
        message: `当前 Agent "${agentName}" 无权使用 "${toolSetName}" 工具集`
      };
    }

    // 激活工具组
    const activeGroups = this.conversationActiveGroups.get(conversationId) || new Set([ToolManager.BASE_GROUP]);
    activeGroups.add(toolSetName);
    this.conversationActiveGroups.set(conversationId, activeGroups);

    // 获取该工具集的详细工具定义
    const toolGroup = this.toolGroups.get(toolSetName);
    const tools = toolGroup ? this.getToolsFromGroup(toolGroup, agent) : [];

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
   * 检查 Agent 对工具集的权限
   */
  private checkAgentToolSetPermission(agent: any, toolSetName: string): boolean {
    if (!agent || !agent.tools) return true;

    const { allow, deny } = agent.tools;

    // 检查黑名单
    if (deny?.some((pattern: string) => this.matchPattern(toolSetName, pattern))) {
      return false;
    }

    // 检查白名单
    if (allow && allow.length > 0) {
      return allow.some((pattern: string) => this.matchPattern(toolSetName, pattern));
    }

    return true;
  }

  /**
   * 从工具组获取工具（应用权限过滤）
   */
  private getToolsFromGroup(toolGroup: ToolGroup, agent: any): Tool[] {
    if (!agent) return toolGroup.tools;

    // 应用工具级别的权限过滤
    return toolGroup.tools.filter(tool => {
      return this.agentManager.checkPermission(agent.name, tool.name);
    });
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
   * 通配符模式匹配
   */
  private matchPattern(target: string, pattern: string): boolean {
    if (pattern.endsWith('*')) {
      return target.startsWith(pattern.slice(0, -1));
    }
    return target === pattern;
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

  // PPTX 相关关键词常量
  private static readonly PPTX_KEYWORDS = [
    'pptx', 'powerpoint', 'presentation', 'slides', 'slide', 'deck',
    '演示', '演示文稿', '幻灯片', 'ppt', '.pptx',
    '重排', '缩略图', 'thumbnails',
  ];

  // Excel 相关关键词常量
  private static readonly XLSX_KEYWORDS = [
    'excel', 'xlsx', 'spreadsheet', '财务', '工作簿',
    '表格', '电子表格', 'sheet', '公式', '单元格',
    '.xlsx', '.xls'
  ];

  // PDF 相关关键词常量
  private static readonly PDF_KEYWORDS = [
    'pdf', 'adobe', 'acrobat',
    '表单', 'form', '合并', 'merge', '提取', 'extract'
  ];

  // OOXML 验证相关关键词常量
  private static readonly OOXML_KEYWORDS = [
    'validate', 'validation', 'verify', 'check', 'repair', 'fix',
    '验证', '校验', '修复', '损坏', 'corrupt', 'structure',
  ];

  // 批量操作相关关键词常量
  private static readonly BATCH_KEYWORDS = [
    'batch', 'bulk', 'multiple', 'all files', 'all documents',
    '批量', 'bulk', '多个', '所有文件', '全部文档',
    'each', 'every', 'all at once',
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

    // 检测 PPTX 关键词
    for (const keyword of ToolManager.PPTX_KEYWORDS) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        if (!groups.includes('pptx')) {
          groups.push('pptx');
        }
        break;
      }
    }

    // 检测 Excel 关键词
    for (const keyword of ToolManager.XLSX_KEYWORDS) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        if (!groups.includes('xlsx')) {
          groups.push('xlsx');
        }
        break;
      }
    }

    // 检测 PDF 关键词
    for (const keyword of ToolManager.PDF_KEYWORDS) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        if (!groups.includes('pdf')) {
          groups.push('pdf');
        }
        break;
      }
    }

    // 检测 OOXML 验证关键词
    for (const keyword of ToolManager.OOXML_KEYWORDS) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        if (!groups.includes('ooxml')) {
          groups.push('ooxml');
        }
        break;
      }
    }

    // 检测批量操作关键词
    for (const keyword of ToolManager.BATCH_KEYWORDS) {
      if (lowerMessage.includes(keyword.toLowerCase())) {
        if (!groups.includes('batch')) {
          groups.push('batch');
        }
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
      } else if (normalizedExt === '.pptx' || normalizedExt === '.ppt') {
        if (!groups.includes('pptx')) {
          groups.push('pptx');
        }
      } else if (normalizedExt === '.xlsx' || normalizedExt === '.xls') {
        if (!groups.includes('xlsx')) {
          groups.push('xlsx');
        }
      } else if (normalizedExt === '.pdf') {
        if (!groups.includes('pdf')) {
          groups.push('pdf');
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
      case 'pptx':
        return [...ToolManager.PPTX_KEYWORDS];
      case 'xlsx':
        return [...ToolManager.XLSX_KEYWORDS];
      case 'pdf':
        return [...ToolManager.PDF_KEYWORDS];
      case 'ooxml':
        return [...ToolManager.OOXML_KEYWORDS];
      case 'batch':
        return [...ToolManager.BATCH_KEYWORDS];
      default:
        return [];
    }
  }

  // ==================== Agent 管理 ====================

  /**
   * 设置对话的 Agent
   */
  setAgent(conversationId: string, agentName: string): void {
    this.conversationAgents.set(conversationId, agentName);
    console.log(`Agent "${agentName}" set for conversation "${conversationId}"`);
  }

  /**
   * 获取对话的当前 Agent
   */
  getAgent(conversationId: string): string | undefined {
    return this.conversationAgents.get(conversationId);
  }

  /**
   * 获取 Agent 的系统提示词
   */
  getAgentSystemPrompt(conversationId: string): string {
    const agentName = this.conversationAgents.get(conversationId);
    if (agentName) {
      return this.agentManager.getSystemPrompt(agentName);
    }
    return '';
  }

  /**
   * 获取 Agent 的模型配置
   */
  getAgentModel(conversationId: string): string | undefined {
    const agentName = this.conversationAgents.get(conversationId);
    if (agentName) {
      return this.agentManager.getModel(agentName);
    }
    return undefined;
  }

  /**
   * 移除对话的 Agent
   */
  removeAgent(conversationId: string): void {
    this.conversationAgents.delete(conversationId);
  }

  /**
   * 获取所有可用的 Agents
   */
  getAllAgents() {
    return this.agentManager.getAllAgents();
  }

  /**
   * 获取指定名称的 Agent 配置
   */
  getAgentConfig(name: string) {
    return this.agentManager.getAgent(name);
  }
}

export const toolManager = new ToolManager();