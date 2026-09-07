import * as path from 'path';
import { outputTruncator } from '../utils/OutputTruncator';
import { getPermissionManager } from './PermissionManager';

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
    console.log(`[ToolManager] executeToolCall: ${toolCall.function.name}(${toolCall.function.arguments?.substring(0, 100)})`);
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

      // 【权限检查】在执行工具前检查权限
      const pm = getPermissionManager();
      const permission = pm.checkPermission(tool.name, args);

      if (permission === 'denied') {
        const riskLevel = pm.getRiskLevel(tool.name);
        console.warn(`[ToolManager] Permission DENIED for tool "${tool.name}" (risk: ${riskLevel})`);
        return {
          toolCallId: toolCall.id,
          name: toolCall.function.name,
          success: false,
          error: `该操作被权限策略拒绝。工具 "${tool.name}" 的风险等级为 ${riskLevel}，需要更高级别的授权。`,
        };
      }

      // Phase 1: 'requires_confirmation' 自动执行但记录警告日志
      // Phase 2 将在此处弹出前端确认对话框，等待用户响应后再继续
      if (permission === 'requires_confirmation') {
        const riskLevel = pm.getRiskLevel(tool.name);
        console.log(`[ToolManager] Permission: auto-executing "${tool.name}" (risk: ${riskLevel}, confirmation deferred to Phase 2)`);
      }

      // 清理路径参数中数字与中文之间的多余空格（模型常见错误）
      // 注意：跳过带扩展名的文件名（如 "小红帽 0.docx"），只清理纯目录路径
      if (args && typeof args === 'object') {
        for (const key of ['path', 'filepath', 'filename', 'file_path', 'dir_path', 'directory', 'element_path', 'parent_path', 'target_path', 'path_a', 'path_b']) {
          if (typeof args[key] === 'string') {
            const val = args[key];
            // 如果值包含文件扩展名（如 .docx, .xlsx），跳过清理，避免破坏文件名中的空格
            const basename = val.split(/[\\/]/).pop() || val;
            if (/\.\w{1,5}$/.test(basename) && basename.includes(' ')) {
              continue; // 文件名有空格且有扩展名，不做清理
            }
            args[key] = val.replace(/(\d)\s+([\u4e00-\u9fa5])/g, '$1$2').replace(/([\u4e00-\u9fa5])\s+(\d)/g, '$1$2');
          }
        }
      }

      // 自动将相对路径解析为工作区绝对路径
      if (args && typeof args === 'object') {
        // 仅对这些明确是文件系统的参数做路径解析（跳过 element_path 等文档内部路径）
        const filePathKeys = ['path', 'filepath', 'filename', 'file_path', 'dir_path', 'directory', 'template', 'output', 'target'];
        // 直接通过 globalThis + Symbol.for 读取工作区路径
        // 不能用 require('./FileTools')，因为 Vite 打包后不存在独立模块文件，require 会静默失败
        const _workspaceKey = Symbol.for('zero-employee:getWorkspacePath()');
        const workspacePath = (globalThis as any)[_workspaceKey] ?? null;
        // namespace=config 时路径是相对于 .config 配置目录的，不应拼接到 workspace
        // 否则 read({filepath:"skills/x/SKILL.md", namespace:"config"}) 会被错误解析到 workspace 下
        const skipWorkspaceResolution = args.namespace === 'config';
        console.log(`[ToolManager] Path resolution check - workspace: ${workspacePath}, tool: ${toolCall.function.name}, skipWorkspace: ${skipWorkspaceResolution}`);
        for (const key of filePathKeys) {
          if (typeof args[key] === 'string') {
            const val = args[key];
            // 跳过已经是绝对路径的值（Windows: C:\..., Unix: /...）
            if (val.match(/^[A-Za-z]:[\\\/]/) || val.startsWith('/')) continue;
            // 跳过 URL
            if (val.startsWith('http://') || val.startsWith('https://')) continue;
            // namespace=config 时路径相对于 .config 目录，交给工具自己解析，不拼 workspace
            if (skipWorkspaceResolution) continue;
            // 相对路径 → 拼接工作区路径
            if (workspacePath) {
              args[key] = path.join(workspacePath, val);
              console.log(`[ToolManager] Resolved relative path: ${val} → ${args[key]}`);
            } else {
              console.warn(`[ToolManager] WARNING: Relative path "${val}" but no workspace set.`);
            }
          }
        }
      }

      // 将 toolCallId 传递给 handler（用于输出截断时的文件名）
      const argsWithId = { ...args, _toolCallId: toolCall.id };
      const result = await tool.handler(argsWithId);

      // 记录工具执行结果到审计日志
      pm.logExecutionResult(tool.name, 'success');

      // 任务工具修改后通知前端面板刷新（tasks:changed 广播）
      if (tool.name === 'task_create' || tool.name === 'task_update' || tool.name === 'task_complete' || tool.name === 'task_list') {
        try {
          const { broadcastTasksChanged } = require('../ipc/tasks');
          broadcastTasksChanged();
        } catch {
          // IPC 尚未注册时忽略
        }
      }

      // 工具输出截断 - 防止大块输出撑爆上下文
      const truncatedResult = await truncateToolOutput(
        result,
        toolCall.function.name,
        toolCall.id,
      );

      return {
        toolCallId: toolCall.id,
        name: toolCall.function.name,
        success: true,
        result: truncatedResult,
      };
    } catch (error: any) {
      // 记录工具执行失败到审计日志
      getPermissionManager().logExecutionResult(tool.name, 'failure');

      return {
        toolCallId: toolCall.id,
        name: toolCall.function.name,
        success: false,
        error: error.message || 'Unknown error',
      };
    }
  }

  async executeToolCalls(toolCalls: ToolCall[], conversationId?: string): Promise<ToolResult[]> {
    // 如果只有一个工具调用，直接串行执行
    if (toolCalls.length <= 1) {
      const result = await this.executeToolCall(toolCalls[0], conversationId);
      return [result];
    }

    // 多个工具调用时并行执行（使用 allSettled 确保单个失败不影响其他）
    const settled = await Promise.allSettled(
      toolCalls.map(tc => this.executeToolCall(tc, conversationId))
    );

    return settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      return {
        toolCallId: toolCalls[i].id,
        name: toolCalls[i].function.name,
        success: false,
        error: r.reason?.message || 'Unknown error',
      };
    });
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

// ==================== 工具输出截断 ====================

const MAX_TOOL_OUTPUT_CHARS = 30000;   // 超过此大小触发截断
const PREVIEW_CHARS = 6000;            // 截断后保留的预览大小
const BASH_TAIL_CHARS = 30000;         // bash 工具保留尾部字符数

/**
 * 截断工具输出，防止大块内容撑爆上下文
 * 参照 OpenCode 的 truncate.ts 实现
 */
async function truncateToolOutput(
  result: any,
  toolName: string,
  toolCallId: string,
): Promise<any> {
  if (!result || !result.success) return result;

  // 序列化结果来检查大小
  const resultStr = safeStringify(result);
  if (resultStr.length <= MAX_TOOL_OUTPUT_CHARS) return result;

  console.log(`[ToolManager] Tool ${toolName} output too large (${(resultStr.length / 1024).toFixed(1)}KB), truncating...`);

  // 对 bash 工具特殊处理：保留尾部（命令输出末尾通常最重要）
  if (toolName === 'bash' && result.stdout !== undefined) {
    return truncateBashOutput(result, toolCallId);
  }

  // 通用截断：调用 OutputTruncator 保存完整内容
  try {
    const truncated = await outputTruncator.truncate(resultStr, toolCallId, toolName);

    // 在结果中添加截断标记
    const hint = truncated.metadata.savedPath
      ? `\n\n[输出已截断（原始大小 ${(resultStr.length / 1024).toFixed(1)}KB），完整内容已保存至: ${truncated.metadata.savedPath}，可用 read 查看]`
      : `\n\n[输出已截断（原始大小 ${(resultStr.length / 1024).toFixed(1)}KB）]`;

    // 对有 content 字段的结果，直接截断 content
    if (typeof result.content === 'string' && result.content.length > PREVIEW_CHARS) {
      return {
        ...result,
        content: result.content.substring(0, PREVIEW_CHARS) + hint,
        _truncated: true,
        _originalSize: resultStr.length,
        _savedPath: truncated.metadata.savedPath,
      };
    }

    // 其他情况：用截断后的 preview 替代整个 result 的字符串表示
    return {
      success: result.success,
      _truncated: true,
      _originalSize: resultStr.length,
      _savedPath: truncated.metadata.savedPath,
      _preview: truncated.displayContent + hint,
    };
  } catch (err) {
    // 截断失败，返回原始结果（降级策略）
    console.warn(`[ToolManager] Failed to truncate ${toolName} output:`, err);
    return result;
  }
}

/**
 * bash 工具的输出截断 - 保留尾部
 */
async function truncateBashOutput(result: any, toolCallId: string): Promise<any> {
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';

  let truncatedStdout = stdout;
  let truncatedStderr = stderr;
  let savedPath: string | undefined;

  // 保存完整输出到文件
  const fullOutput = `=== STDOUT ===\n${stdout}\n\n=== STDERR ===\n${stderr}`;
  try {
    const truncated = await outputTruncator.truncate(fullOutput, toolCallId, 'bash');
    savedPath = truncated.metadata.savedPath;
  } catch (e) {
    // 保存失败，继续截断
  }

  if (stdout.length > BASH_TAIL_CHARS) {
    truncatedStdout = `... [前面已省略 ${(stdout.length - BASH_TAIL_CHARS).toLocaleString()} 字符]\n` +
      stdout.slice(-BASH_TAIL_CHARS);
  }
  if (stderr.length > 5000) {
    truncatedStderr = stderr.slice(-5000);
  }

  const hint = savedPath
    ? `\n[命令输出已截断，完整内容已保存至: ${savedPath}]`
    : '';

  return {
    ...result,
    stdout: truncatedStdout + hint,
    stderr: truncatedStderr,
    _truncated: stdout.length > BASH_TAIL_CHARS || stderr.length > 5000,
    _originalSize: fullOutput.length,
    _savedPath: savedPath,
  };
}

/**
 * 安全 JSON 序列化（处理循环引用）
 */
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, (_, value) => {
      if (typeof value === 'object' && value !== null) {
        if (seen.has(value)) return '[Circular]';
        seen.add(value);
      }
      return value;
    });
  } catch {
    return String(obj);
  }
}