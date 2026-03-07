import { ipcMain } from 'electron';
import { OpenAIClient } from '../api/openai';
import Store from 'electron-store';
import { toolManager, ToolGroup, ToolManager } from '../tools/ToolManager';
import { fileTools } from '../tools/FileTools';
import { bashTools } from '../tools/BashTools';
// Office tools removed: BaseTools, WordTools, TemplateTools, PPTXTools, BatchTools, ExcelTools, PDFTools, OoxmlTools
import { getWorkspacePath } from '../tools/FileTools';
import { getContextBuilder } from '../core/ContextBuilder';
import { countContextTokens } from '../utils/tokenCounter';
import type { Attachment, Message } from '../../../src/types';

let currentClient: OpenAIClient | null = null;
let currentAbortController: AbortController | null = null;

/**
 * 处理消息中的附件，将附件内容注入到消息中供 LLM 理解
 * @param messages 原始消息数组
 * @param maxAttachmentTokens 附件内容最大 token 数限制
 * @returns 处理后的消息数组（符合 OpenAI 多模态格式）
 */
function processAttachmentsInMessages(messages: any[], maxAttachmentTokens: number = 8000): any[] {
  // 估算文本 token 数（简单估算：1 token ≈ 4 字符）
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);

  // 用于存储所有附件信息的总 token 数
  let totalAttachmentTokens = 0;
  const processedMessages: any[] = [];

  for (const msg of messages) {
    // 只处理用户消息
    if (msg.role !== 'user') {
      processedMessages.push(msg);
      continue;
    }

    // 检查是否有附件
    const hasImages = msg.images && Array.isArray(msg.images) && msg.images.length > 0;
    const hasAttachments = msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0;

    if (!hasImages && !hasAttachments) {
      processedMessages.push(msg);
      continue;
    }

    const contentParts: any[] = [];
    const originalContent = typeof msg.content === 'string' ? msg.content : '';

    // 添加原始文本内容
    if (originalContent) {
      contentParts.push({
        type: 'text',
        text: originalContent,
      });
    }

    // 处理图片附件（多模态格式）
    if (hasImages) {
      for (const imageData of msg.images) {
        // 支持 base64 data URL 格式
        if (typeof imageData === 'string' && imageData.startsWith('data:')) {
          contentParts.push({
            type: 'image_url',
            image_url: {
              url: imageData,
            },
          });
        }
      }
    }

    // 处理其他附件（文档、数据等）
    if (hasAttachments) {
      const attachmentInfos: string[] = [];

      for (const attachment of msg.attachments as Attachment[]) {
        // 构建附件基础信息
        let attachmentInfo = `\n\n---\n**附件：${attachment.fileName}**\n`;
        attachmentInfo += `- 类型：${attachment.fileType}\n`;
        attachmentInfo += `- 大小：${(attachment.fileSize / 1024).toFixed(1)} KB\n`;

        // 如果有提取的文本内容，添加到消息中
        if (attachment.extractedContent?.text) {
          const text = attachment.extractedContent.text;
          const textTokens = estimateTokens(text);

          // 检查是否会超出限制
          if (totalAttachmentTokens + textTokens > maxAttachmentTokens) {
            // 超出限制，只添加摘要/预览
            console.warn(`[Attachment] 附件 ${attachment.fileName} 内容过长 (${textTokens} tokens)，只保留预览`);
            attachmentInfo += `\n**文件预览（内容过大，已截断）：**\n\`\`\`\n${text.slice(0, 2000)}\n...\n[完整内容共 ${text.length} 字符，约 ${textTokens} tokens]\n\`\`\`\n`;
          } else {
            // 未超出限制，添加完整内容
            attachmentInfo += `\n**文件内容：**\n\`\`\`\n${text}\n\`\`\`\n`;
            totalAttachmentTokens += textTokens;
          }
        } else if (attachment.extractedContent?.preview) {
          attachmentInfo += `\n**文件预览：**\n\`\`\`\n${attachment.extractedContent.preview}\n\`\`\`\n`;
        }

        attachmentInfos.push(attachmentInfo);
      }

      // 将附件信息追加到文本内容
      if (attachmentInfos.length > 0) {
        // 找到文本部分并追加附件信息
        const textPart = contentParts.find((p) => p.type === 'text');
        const attachmentText = '\n\n---\n**用户上传了以下附件：**' + attachmentInfos.join('');

        if (textPart) {
          textPart.text += attachmentText;
        } else {
          contentParts.unshift({
            type: 'text',
            text: attachmentText,
          });
        }
      }
    }

    // 返回多模态格式（始终使用数组格式，保持一致性）
    if (contentParts.length > 0) {
      processedMessages.push({
        ...msg,
        content: contentParts,
      });
    } else {
      processedMessages.push(msg);
    }
  }

  return processedMessages;
}

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

  /**
   * 构建中文系统提示词
   * 使用 ContextBuilder 生成完整的 nanobot 风格提示词
   *
   * 包含：核心身份 + 时间 + Bootstrap 文件 + 内存 + 技能 + 工具定义
   */
  async function buildNanobotStyleSystemPrompt(conversationId?: string): Promise<string> {
    try {
      const contextBuilder = getContextBuilder();
      const workspacePath = getWorkspacePath();

      // nanobot 风格：不需要 activeSkills 参数，skills 会自动加载
      const systemPrompt = await contextBuilder.buildSystemPrompt({
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
  // 注册基础工具组（包含文件操作工具和 Bash 工具）
  const baseToolGroup: ToolGroup = {
    name: 'base',
    tools: [...fileTools, ...bashTools],
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

      // 调试：打印接收到的消息（只打印最后几条）
      console.log('[chat:stream] Received from frontend:');
      const printCount = Math.min(3, messages.length);
      for (let i = Math.max(0, messages.length - printCount); i < messages.length; i++) {
        const m = messages[i];
        const contentPreview = typeof m.content === 'string'
          ? m.content?.substring(0, 40) + (m.content?.length > 40 ? '...' : '')
          : `[多模态内容: ${(m.content as any[])?.length || 0} 部分]`;
        console.log(`  [${i}] ${m.role}: ${contentPreview} ${m.tool_calls ? '(tool_calls)' : ''}`);
      }

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
      console.log('[chat:stream] After adding system message, total:', messages.length);

      // 处理消息中的附件，将附件内容注入到消息中
      messages = processAttachmentsInMessages(messages);

      // 获取当前激活的工具定义
      let tools = conversationId
        ? toolManager.getActiveToolDefinitions(conversationId)
        : toolManager.getOpenAIFunctionDefinitions();

      // 工具调用历史，用于检测重复调用
      const toolCallHistory: string[] = [];
      const MAX_TOOL_ITERATIONS = 50;  // 安全上限，防止真正的无限循环
      const MAX_SAME_TOOL_CALLS = 3;   // 相同工具调用次数限制
      let iteration = 0;

      let roundChunks: string[] = [];  // 每轮的文本内容（循环外声明）

      while (true) {
        iteration++;

        // 安全上限检查（只在异常情况触发）
        if (iteration > MAX_TOOL_ITERATIONS) {
          console.error(`[ERROR] Tool iteration limit reached (${MAX_TOOL_ITERATIONS}), breaking loop`);
          messages.push({
            id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            role: 'system',
            content: `已达到最大工具调用轮次限制。请直接回答用户问题，不要继续调用工具。`,
          });
          break;
        }

        // 计算 token 使用量
        const currentTokens = countContextTokens(messages, systemPromptContent, tools);
        const maxTokens = config.maxTokens || 128000;
        const tokenPercentage = (currentTokens / maxTokens) * 100;

        // 发送 token 使用情况给前端
        event.sender.send('chat:token_usage', {
          current: currentTokens,
          max: maxTokens,
          percentage: tokenPercentage,
          compressedCount: 0,
        });

        let hasToolCalls = false;
        roundChunks = [];  // 清空，准备新的一轮

        console.log('[DEBUG] Starting streamChat request, messages count:', messages.length);
        const roundNumber = iteration;

        let chunkCount = 0;
        for await (const chunk of client.streamChat(messages, currentAbortController.signal, tools)) {
          chunkCount++;
          try {
            const parsed = JSON.parse(chunk);

            // 检查是否是工具调用类型的消息
            if (parsed.type === 'tool_calls') {
              hasToolCalls = true;

              // 如果这一轮有文本内容，先添加到 messages
              if (roundChunks.length > 0) {
                const content = roundChunks.join('');
                console.log('[chat:stream] Adding assistant message with content:', content.substring(0, 50) + '...');
                messages.push({
                  id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  role: 'assistant',
                  content: content,
                });
                roundChunks = [];  // 清空，准备下一轮
              }

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
                  id: `system-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
                  id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  role: 'assistant',
                  content: '',
                  tool_calls: parsed.toolCalls,
                });
                console.log('[chat:stream] Added assistant with tool_calls, count:', parsed.toolCalls.length);

                for (const result of results) {
                  messages.push({
                    id: `tool-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    role: 'tool',
                    tool_call_id: result.toolCallId,
                    content: safeStringify(result),
                  });
                }
                console.log('[chat:stream] Added', results.length, 'tool results, messages now:', messages.length);
                
                break;
              } catch (toolError: any) {
                console.error('\n>>> ERROR during tool execution:', toolError);
                console.error('Error stack:', toolError.stack);
                throw toolError;
              }
            }
          } catch (e) {
            roundChunks.push(chunk);
            event.sender.send('chat:chunk', chunk);
          }
        }

        console.log(`[DEBUG] Round ${roundNumber}: Stream ended with ${chunkCount} chunks, hasToolCalls: ${hasToolCalls}`);

        if (hasToolCalls) {
          console.log(`[DEBUG] Round ${roundNumber}: Tool calls detected, continuing loop...`);
        } else {
          console.log(`[DEBUG] Round ${roundNumber}: No tool calls, roundChunks length: ${roundChunks.length}`);
          if (roundChunks.length === 0) {
            console.warn(`[WARN] Round ${roundNumber}: No tool calls AND no content! Model may have stopped prematurely.`);
          }
        }

        if (!hasToolCalls) {
          break;
        }
      }

      // 将最后一轮的文本内容作为 assistant 消息添加到 messages 数组
      if (roundChunks.length > 0) {
        const finalContent = roundChunks.join('');
        console.log('[chat:stream] Adding final assistant message:', finalContent.substring(0, 50) + '...');
        messages.push({
          id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: 'assistant',
          content: finalContent,
        });
      } else {
        console.log('[chat:stream] No final content in roundChunks');
      }

      currentClient = null;
      currentAbortController = null;

      // 返回完整消息序列供前端下次使用（不包含 system 消息）
      const apiMessages = messages.filter(m => m.role !== 'system');

      // 调试：打印返回给前端的消息（只打印最后几条和关键信息）
      console.log('[chat:stream] Returning to frontend, total:', apiMessages.length);
      const userCount = apiMessages.filter(m => m.role === 'user').length;
      const assistantCount = apiMessages.filter(m => m.role === 'assistant').length;
      const toolCount = apiMessages.filter(m => m.role === 'tool').length;
      console.log(`  user: ${userCount}, assistant: ${assistantCount}, tool: ${toolCount}`);

      // 打印最后 3 条消息
      const lastFew = Math.min(3, apiMessages.length);
      for (let i = Math.max(0, apiMessages.length - lastFew); i < apiMessages.length; i++) {
        const m = apiMessages[i];
        const contentPreview = typeof m.content === 'string'
          ? m.content?.substring(0, 40) + (m.content?.length > 40 ? '...' : '')
          : `[多模态内容: ${(m.content as any[])?.length || 0} 部分]`;
        console.log(`  [${i}] ${m.role}: ${contentPreview} ${m.tool_calls ? '(tool_calls)' : ''}`);
      }

      return {
        success: true,
        content: roundChunks.join(''),
        messages: apiMessages  // 返回完整的消息序列
      };
    } catch (error: any) {
      const status = error.response?.status;
      const isRateLimit = status === 429;

      console.error('\n========== Chat Stream Error ==========');
      console.error('Status:', status || 'Unknown');
      console.error('Message:', error.message);

      // 打印更详细的错误信息
      if (error.response?.data) {
        console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
      }
      if (error.config?.url) {
        console.error('Request URL:', error.config.url);
      }
      if (error.config?.method) {
        console.error('Request Method:', error.config.method);
      }
      if (error.code) {
        console.error('Error Code:', error.code);
      }

      // 打印请求体大小（用于调试过大请求问题）
      if (error.config?.data) {
        const requestData = error.config.data;
        const dataSize = typeof requestData === 'string' ? requestData.length : JSON.stringify(requestData).length;
        console.error('Request Body Size:', `${(dataSize / 1024).toFixed(2)} KB (${dataSize} chars)`);
      }

      if (isRateLimit) {
        console.error('Type: Rate Limit Exceeded (429)');
        console.error('Tip: Please wait a moment before retrying');
      }

      console.error('==========================================\n');

      currentClient = null;
      currentAbortController = null;

      // 构建详细的错误消息
      let errorMessage = error.message;

      if (error.response?.data?.error?.message) {
        errorMessage = error.response.data.error.message;
      } else if (error.response?.data?.error) {
        errorMessage = JSON.stringify(error.response.data.error);
      }

      // 添加状态码信息
      if (status) {
        errorMessage = `[${status}] ${errorMessage}`;
      }

      return {
        success: false,
        error: isRateLimit ? '请求过于频繁，请稍后再试' : errorMessage
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
}

/**
 * Register context-related IPC handlers
 */
export function registerContextHandlers(): void {
  const contextBuilder = getContextBuilder();

  // Build system prompt with ContextBuilder
  ipcMain.handle('context:buildSystemPrompt', async (_event, options?: {
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
