import { ipcMain } from 'electron';
import { OpenAIClient } from '../api/openai';
import Store from 'electron-store';
import { toolManager, ToolGroup, ToolManager } from '../tools/ToolManager';
import { fileTools, skillTools } from '../tools/FileTools';
import { pythonTools } from '../tools/PythonTools';
// Office tools removed: BaseTools, WordTools, TemplateTools, PPTXTools, BatchTools, ExcelTools, PDFTools, OoxmlTools
import { getWorkspacePath } from '../tools/FileTools';
import { getContextBuilder } from '../core/ContextBuilder';

let currentClient: OpenAIClient | null = null;
let currentAbortController: AbortController | null = null;

  function safeStringify(obj: any, indent: number | string = 2): string {
    const cache = new Set();
    let result = JSON.stringify(
      obj,
      (_key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (cache.has(value)) {
            return '[Circular Reference]';
          }
          cache.add(value);
        }
        return value;
      },
      indent
    );

    return result;
  }

  function trimMessages(messages: any[], maxMessages: number = 10): any[] {
    if (messages.length <= maxMessages) {
      return messages;
    }

    const alwaysKeep: any[] = [];
    const recentMessages: any[] = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        alwaysKeep.push(msg);
      } else {
        recentMessages.push(msg);
      }
    }

    const trimmedRecent = recentMessages.slice(-maxMessages);
    return [...alwaysKeep, ...trimmedRecent];
  }

  /**
   * 构建中文系统提示词
   * 使用 ContextBuilder 生成完整的 nanobot 风格提示词
   *
   * 包含：核心身份 + 时间 + Bootstrap 文件 + 内存 + 技能 + Agent + 工具定义
   */
  async function buildNanobotStyleSystemPrompt(conversationId?: string): Promise<string> {
    try {
      const contextBuilder = getContextBuilder();
      const workspacePath = getWorkspacePath();
      const agentName = conversationId ? toolManager.getAgent(conversationId) : undefined;

      // nanobot 风格：不需要 activeSkills 参数，skills 会自动加载
      const systemPrompt = await contextBuilder.buildSystemPrompt({
        agentName,
        workspacePath: workspacePath || undefined,
        includeMemory: true,
      });

      return systemPrompt;
    } catch (error: any) {
      console.error('[chat] Failed to build system prompt with ContextBuilder:', error.message);
      // Fallback to simple prompt
      return `你是一个 AI 助手，可以帮助用户完成各种任务。`;
    }
  }

export function registerChatHandlers(store: Store) {
  // 注册基础工具组（包含文件操作工具、技能工具和 Python 工具）
  const baseToolGroup: ToolGroup = {
    name: 'base',
    tools: [...fileTools, ...skillTools, ...pythonTools],
    keywords: [],
    triggers: {
      keywords: [],
      fileExtensions: [],
      dependentTools: [],
    },
  };
  toolManager.registerToolGroup(baseToolGroup);

  // Office 工具组已删除：word, template, pptx, xlsx, pdf, batch
  // 用户可以在 .zero-employee/skills/ 中定义自定义技能

  // 初始化 Office Skills (现在只从 workspace 加载)
  toolManager.initialize().catch(console.error);

  ipcMain.handle('chat:generateTitle', async (_event, message: string) => {
    try {
      const config = store.get('config') as any;

      if (!config || !config.apiKey) {
        throw new Error('请先配置 API Key');
      }

      const client = new OpenAIClient(
        config.baseUrl,
        config.apiKey,
        config.model,
        config.temperature,
        100
      );

      const titlePrompt = `请根据以下对话内容生成一个简短的中文标题（不超过10个字符）：\n\n${message}\n\n只返回标题，不要其他内容。`;

      const messages = [
        { role: 'user', content: titlePrompt }
      ];

      const chunks: string[] = [];
      for await (const chunk of client.streamChat(messages, undefined, [])) {
        try {
          const parsed = JSON.parse(chunk);
          if (parsed.type !== 'tool_calls') {
            chunks.push(chunk);
          }
        } catch (e) {
          chunks.push(chunk);
        }
      }

      let title = chunks.join('').trim();

      if (title.length > 10) {
        title = title.substring(0, 10);
      }

      if (!title) {
        title = '新对话';
      }

      return { success: true, title };
    } catch (error: any) {
      console.error('Failed to generate conversation title:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('chat:stream', async (event, messages: any[], conversationId?: string) => {
    try {
      const config = store.get('config') as any;

      if (!config || !config.apiKey) {
        throw new Error('请先配置 API Key');
      }

      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }

      currentAbortController = new AbortController();

      const client = new OpenAIClient(
        config.baseUrl,
        config.apiKey,
        config.model,
        config.temperature,
        config.maxTokens
      );

      currentClient = client;

      const chunks: string[] = [];

      // 重置对话的工具组状态（每次新对话都从基础工具开始）
      if (conversationId) {
        toolManager.resetForConversation(conversationId);
      }

      // 构建 nanobot 风格的系统提示词
      const systemPromptContent = await buildNanobotStyleSystemPrompt(conversationId);

      // 将系统消息添加到消息开头
      const systemMessage = {
        role: 'system' as const,
        content: systemPromptContent
      };

      messages = [systemMessage, ...messages];

      // 获取当前激活的工具定义
      let tools = conversationId
        ? toolManager.getActiveToolDefinitions(conversationId)
        : toolManager.getOpenAIFunctionDefinitions();

      // 工具调用历史，用于检测重复调用
      const toolCallHistory: string[] = [];
      const MAX_TOOL_ITERATIONS = 50;  // 安全上限，防止真正的无限循环
      const MAX_SAME_TOOL_CALLS = 3;   // 相同工具调用次数限制
      let iteration = 0;

      while (true) {
        iteration++;

        // 安全上限检查（只在异常情况触发）
        if (iteration > MAX_TOOL_ITERATIONS) {
          console.error(`[ERROR] Tool iteration limit reached (${MAX_TOOL_ITERATIONS}), breaking loop`);
          messages.push({
            role: 'system',
            content: `已达到最大工具调用轮次限制。请直接回答用户问题，不要继续调用工具。`,
          });
          break;
        }

        let hasToolCalls = false;

        messages = trimMessages(messages, 10);

        console.log('[DEBUG] Starting streamChat request, messages count:', messages.length);

        for await (const chunk of client.streamChat(messages, currentAbortController.signal, tools)) {
          try {
            const parsed = JSON.parse(chunk);
            
            if (parsed.type === 'tool_calls') {
              hasToolCalls = true;

              // 检测重复的工具调用
              const duplicateToolCalls: string[] = [];
              for (const toolCall of parsed.toolCalls) {
                const callKey = `${toolCall.function.name}:${JSON.stringify(toolCall.function.arguments)}`;
                const sameCallCount = toolCallHistory.filter(k => k === callKey).length;

                if (sameCallCount >= MAX_SAME_TOOL_CALLS) {
                  duplicateToolCalls.push(`${toolCall.function.name} (已调用 ${sameCallCount} 次)`);
                  console.warn(`[WARN] Duplicate tool call detected: ${callKey}`);
                }

                toolCallHistory.push(callKey);
              }

              // 如果有重复调用，跳过执行并提示 AI
              if (duplicateToolCalls.length > 0) {
                console.error(`[ERROR] Blocking duplicate tool calls: ${duplicateToolCalls.join(', ')}`);
                messages.push({
                  role: 'system',
                  content: `检测到重复的工具调用: ${duplicateToolCalls.join(', ')}。请停止重复调用，使用已有结果回答用户问题。`,
                });
                break;
              }

              event.sender.send('chat:tool_calls', parsed.toolCalls);

              const startTimes = new Map<string, number>();
              
              try {
                for (const toolCall of parsed.toolCalls) {
                  const startTime = Date.now();
                  startTimes.set(toolCall.id, startTime);
                  const tool = toolManager.getTool(toolCall.function.name);
                  const description = tool?.description || '';
                  
                  event.sender.send('chat:tool_start', {
                    toolCallId: toolCall.id,
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                    description,
                    timestamp: startTime,
                  });
                }

                const results = await toolManager.executeToolCalls(parsed.toolCalls, conversationId);

                // 检测是否需要加载新的工具组（包括 activate_toolset 的处理）
                let toolsetActivated = false;
                for (let i = 0; i < results.length; i++) {
                  const result = results[i];
                  const endTime = Date.now();
                  const startTime = startTimes.get(result.toolCallId) || endTime;
                  const duration = endTime - startTime;

                  // 处理 activate_toolset 工具调用
                  if (result.name === 'activate_toolset' && result.success && conversationId) {
                    let args: any;
                    try {
                      args = JSON.parse(parsed.toolCalls[i].function.arguments);
                    } catch {
                      args = {};
                    }

                    const activateResult = await toolManager.activateToolSet(conversationId, args.toolset);
                    if (activateResult.success) {
                      toolsetActivated = true;
                      // 更新结果以包含激活的工具信息
                      results[i].result = activateResult;

                      event.sender.send('chat:tools_loaded', {
                        group: args.toolset,
                        reason: 'Explicitly activated by model',
                        toolCount: activateResult.tools?.length || 0,
                      });
                    }
                  }

                  event.sender.send('chat:tool_complete', {
                    toolCallId: result.toolCallId,
                    duration,
                    success: result.success,
                    timestamp: endTime,
                  });
                }

                // 如果有工具集被激活，更新工具定义
                if (toolsetActivated && conversationId) {
                  tools = toolManager.getActiveToolDefinitions(conversationId);
                }

                event.sender.send('chat:tool_results', results);

                messages.push({
                  role: 'assistant',
                  content: '',
                  tool_calls: parsed.toolCalls,
                });

                for (const result of results) {
                  messages.push({
                    role: 'tool',
                    tool_call_id: result.toolCallId,
                    content: safeStringify(result),
                  });
                }
                
                break;
              } catch (toolError: any) {
                console.error('\n>>> ERROR during tool execution:', toolError);
                console.error('Error stack:', toolError.stack);
                throw toolError;
              }
            }
          } catch (e) {
            chunks.push(chunk);
            event.sender.send('chat:chunk', chunk);
          }
        }

        if (hasToolCalls) {
          console.log('[DEBUG] Tool calls detected, continuing loop...');
        } else {
          console.log('[DEBUG] No tool calls, exiting loop');
        }

        if (!hasToolCalls) {
          break;
        }
      }

      currentClient = null;
      currentAbortController = null;

      return { success: true, content: chunks.join('') };
    } catch (error: any) {
      const status = error.response?.status;
      const isRateLimit = status === 429;

      console.error('\n========== Chat Stream Error ==========');
      console.error('Status:', status || 'Unknown');
      console.error('Message:', error.message);

      if (isRateLimit) {
        console.error('Type: Rate Limit Exceeded (429)');
        console.error('Tip: Please wait a moment before retrying');
      }

      console.error('==========================================\n');

      currentClient = null;
      currentAbortController = null;

      return {
        success: false,
        error: isRateLimit ? '请求过于频繁，请稍后再试' : error.message
      };
    }
  });

  ipcMain.handle('chat:stop', () => {
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }

    if (currentClient) {
      currentClient = null;
    }

    return { success: true };
  });

  // ==================== Agent 管理 ====================

  // 设置对话的 Agent
  ipcMain.handle('chat:setAgent', (_event, conversationId: string, agentName: string) => {
    toolManager.setAgent(conversationId, agentName);
    return { success: true, agentName };
  });

  // 获取对话的当前 Agent
  ipcMain.handle('chat:getAgent', (_event, conversationId: string) => {
    const agentName = toolManager.getAgent(conversationId);
    return { success: true, agentName };
  });

  // 获取所有可用的 Agents
  ipcMain.handle('chat:getAllAgents', () => {
    const agents = toolManager.getAllAgents();
    return { success: true, agents };
  });

  // 获取 Agent 的系统提示词
  ipcMain.handle('chat:getAgentSystemPrompt', (_event, conversationId: string) => {
    const prompt = toolManager.getAgentSystemPrompt(conversationId);
    return { success: true, prompt };
  });

  // 获取 Agent 的模型配置
  ipcMain.handle('chat:getAgentModel', (_event, conversationId: string) => {
    const model = toolManager.getAgentModel(conversationId);
    return { success: true, model };
  });
}

/**
 * Register context-related IPC handlers
 */
export function registerContextHandlers(): void {
  const contextBuilder = getContextBuilder();

  // Build system prompt with ContextBuilder
  ipcMain.handle('context:buildSystemPrompt', async (_event, options?: {
    agentName?: string;
    workspacePath?: string;
    includeMemory?: boolean;
    maxMemoryTokens?: number;
  }) => {
    try {
      const prompt = await contextBuilder.buildSystemPrompt(options || {});
      return {
        success: true,
        prompt,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // Estimate system prompt tokens
  ipcMain.handle('context:estimateTokens', async (_event, options?: {
    agentName?: string;
    workspacePath?: string;
    includeMemory?: boolean;
  }) => {
    try {
      const tokens = await contextBuilder.estimateSystemPromptTokens(options || {});
      return {
        success: true,
        tokens,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Context handlers registered');
}
