import { ipcMain } from 'electron';
import { OpenAIClient } from '../api/openai';
import Store from 'electron-store';
import { toolManager, ToolGroup, ToolManager, TOOL_SETS_META } from '../tools/ToolManager';
import { fileTools } from '../tools/FileTools';
import { baseTools } from '../tools/BaseTools';
import { wordTools } from '../tools/WordTools';
import { templateTools } from '../tools/TemplateTools';
// import ooxmlToolGroup from '../tools/OoxmlTools'; // 已卸载 - 功能已整合到 Office Skills
import pptxToolGroup from '../tools/PPTXTools';
import batchToolGroup from '../tools/BatchTools';
import xlsxToolGroup from '../tools/ExcelTools';
import pdfToolGroup from '../tools/PDFTools';

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

    const maxStringLength = 5000;
    if (result.length > maxStringLength) {
      result = result.substring(0, maxStringLength) + `\n...[内容已截断，总长度${result.length}字符，仅显示前${maxStringLength}字符]`;
    }

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

export function registerChatHandlers(store: Store) {
  // 注册基础工具组（包含 activate_toolset 工具）
  const baseToolGroup: ToolGroup = {
    name: 'base',
    tools: [...fileTools, ...baseTools],
    keywords: [],
    triggers: {
      keywords: [],
      fileExtensions: [],
      dependentTools: [],
    },
  };
  toolManager.registerToolGroup(baseToolGroup);

  // 注册 Word 工具组 - 使用 Office Skills 增强
  const wordToolGroup: ToolGroup = {
    name: 'word',
    tools: wordTools,
    keywords: ToolManager.getGroupKeywords('word'),
    triggers: {
      keywords: ToolManager.getGroupKeywords('word'),
      fileExtensions: ['.docx', '.doc'],
      dependentTools: ['read_file', 'search_files', 'search_in_files'],
    },
  };
  toolManager.registerToolGroup(wordToolGroup);

  // 注册模板工具组
  const templateToolGroup: ToolGroup = {
    name: 'template',
    tools: templateTools,
    keywords: ['模板', 'template', '格式转换', '生成文档', '报告', '工作汇总', '周报', '值班记录'],
    triggers: {
      keywords: ['模板', 'template', '格式转换', '周报', '值班记录', '工作汇总', '助手'],
      fileExtensions: ['.docx', '.doc'],
      dependentTools: ['read_file', 'create_word'],
    },
  };
  toolManager.registerToolGroup(templateToolGroup);

  // 注册 OOXML 验证工具组 - 已卸载，功能已整合到 Office Skills
  // toolManager.registerToolGroup(ooxmlToolGroup);

  // 注册 PPTX 工具组
  toolManager.registerToolGroup(pptxToolGroup);

  // 注册 Excel 工具组
  toolManager.registerToolGroup(xlsxToolGroup);

  // 注册 PDF 工具组
  toolManager.registerToolGroup(pdfToolGroup);

  // 注册批量操作工具组
  toolManager.registerToolGroup(batchToolGroup);

  // 初始化 Office Skills
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

      // 获取工具集概览（用于系统消息）
      const toolSetsOverview = conversationId
        ? toolManager.getToolSetsOverview(conversationId)
        : TOOL_SETS_META;

      // 获取当前激活的工具组
      const activeGroups = conversationId
        ? toolManager.getActiveGroups(conversationId)
        : ['base'];

      // 构建系统消息，包含工具集概览
      const toolSystemMessage = {
        role: 'system' as const,
        content: `## 可用工具集

当前已激活的工具：${activeGroups.join(', ') || '仅基础工具'}

可用工具集概览：
${toolSetsOverview.map(ts => `- **${ts.name}**: ${ts.description}`).join('\n')}

使用工具：如需使用未激活的工具集，请调用 activate_toolset 工具。
注意：激活工具集会增加上下文大小，请仅激活需要的工具集。
`
      };

      // 将工具系统消息添加到消息开头
      messages = [toolSystemMessage, ...messages];

      // 获取当前激活的工具定义
      let tools = conversationId
        ? toolManager.getActiveToolDefinitions(conversationId)
        : toolManager.getOpenAIFunctionDefinitions();

      while (true) {
        let hasToolCalls = false;

        messages = trimMessages(messages, 10);

        console.log('[DEBUG] Starting streamChat request, messages count:', messages.length);

        for await (const chunk of client.streamChat(messages, currentAbortController.signal, tools)) {
          try {
            const parsed = JSON.parse(chunk);
            
            if (parsed.type === 'tool_calls') {
              hasToolCalls = true;
              
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

                  // 动态工具加载：检测是否需要加载 Word 工具
                  if (conversationId && toolManager.shouldLoadWordTools(result.name, result)) {
                    toolManager.activateGroup('word', conversationId);
                    toolsetActivated = true;

                    event.sender.send('chat:tools_loaded', {
                      group: 'word',
                      reason: `Detected Word file access via ${result.name}`,
                      toolCount: 0,  // Will be updated after tools refresh
                    });
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
