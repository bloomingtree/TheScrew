/**
 * AgentRunner - 可复用的 agent 执行核心
 *
 * 从 chat:stream IPC handler 抽取，供三条调用路径复用：
 *   1. 用户对话（chat:stream，source='user'）
 *   2. 定时任务触发的 agent 自驱动（JobDispatcher，source='cron'）
 *   3. Heartbeat 后台巡检（HeartbeatService，source='heartbeat'）
 *
 * 统一了：配置获取 → ContextBuilder 构建 system prompt → 工具循环 →
 * token 超过 85% 自动压缩 → 流式推送。
 *
 * 设计原则：本函数是 chat:stream 核心逻辑的等价抽取（机械重构），
 * event.sender 参数化为 sender: WebContents，其余逻辑不变。
 */

import type { WebContents } from 'electron';
import { OpenAIClient } from '../api/openai';
import { toolManager } from '../tools/ToolManager';
import { getWorkspacePath } from '../tools/FileTools';
import { getContextBuilder } from './ContextBuilder';
import { countContextTokens } from '../utils/tokenCounter';
import type { Attachment } from '../../../src/types';
import { getAppConfigStore, ModelCapabilities, ThinkingMode } from '../config/AppConfigStore';
import { detectCapabilities } from '../utils/capabilityDetector';

// ============================================================================
// 内部状态：当前正在执行的 turn（用于 chat:stop 中断）
// ============================================================================

let currentClient: OpenAIClient | null = null;
let currentAbortController: AbortController | null = null;

/**
 * 中断当前正在执行的 agent turn（供 chat:stop 调用）。
 * 同一时刻只允许一个 turn 执行；新 turn 启动时会自动 abort 上一个。
 */
export function abortCurrentTurn(): void {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
  }
  currentClient = null;
}

// ============================================================================
// 常量
// ============================================================================

const TOOL_OUTPUT_PRUNE_THRESHOLD = 2000; // 超过 2000 字符的工具输出可被修剪
const PROTECT_RECENT_TURNS = 4;           // 保留最近 4 条非 system 消息

// ============================================================================
// 辅助函数（从 chat.ts 迁移，逻辑不变）
// ============================================================================

export function safeStringify(obj: any, indent: number | string = 2): string {
  const cache = new Set();
  const result = JSON.stringify(
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
 * 处理消息中的附件，将附件内容注入到消息中供 LLM 理解
 */
function processAttachmentsInMessages(messages: any[], capabilities: ModelCapabilities, maxAttachmentTokens: number = 8000): any[] {
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);
  let totalAttachmentTokens = 0;
  const processedMessages: any[] = [];

  for (const msg of messages) {
    if (msg.role !== 'user') {
      processedMessages.push(msg);
      continue;
    }

    const hasImages = msg.images && Array.isArray(msg.images) && msg.images.length > 0;
    const hasAttachments = msg.attachments && Array.isArray(msg.attachments) && msg.attachments.length > 0;

    if (!hasImages && !hasAttachments) {
      processedMessages.push(msg);
      continue;
    }

    const contentParts: any[] = [];
    const originalContent = typeof msg.content === 'string' ? msg.content : '';

    if (originalContent) {
      contentParts.push({ type: 'text', text: originalContent });
    }

    if (hasImages) {
      if (capabilities.vision) {
        for (const imageData of msg.images) {
          if (typeof imageData === 'string' && imageData.startsWith('data:')) {
            contentParts.push({ type: 'image_url', image_url: { url: imageData } });
          }
        }
      } else {
        const imageNotice = msg.images.map((_: any, i: number) =>
          `[图片 ${i + 1}: 已保存，当前模型不支持视觉能力]`
        ).join('\n');
        const textPart = contentParts.find((p: any) => p.type === 'text');
        if (textPart) {
          textPart.text += '\n\n' + imageNotice;
        } else {
          contentParts.unshift({ type: 'text', text: imageNotice });
        }
      }
    }

    if (hasAttachments) {
      const attachmentInfos: string[] = [];
      for (const attachment of msg.attachments as Attachment[]) {
        let attachmentInfo = `\n\n---\n**附件：${attachment.fileName}**\n`;
        attachmentInfo += `- 类型：${attachment.fileType}\n`;
        attachmentInfo += `- 大小：${(attachment.fileSize / 1024).toFixed(1)} KB\n`;

        if (attachment.extractedContent?.text) {
          const text = attachment.extractedContent.text;
          const textTokens = estimateTokens(text);
          if (totalAttachmentTokens + textTokens > maxAttachmentTokens) {
            console.warn(`[Attachment] 附件 ${attachment.fileName} 内容过长 (${textTokens} tokens)，只保留预览`);
            attachmentInfo += `\n**文件预览（内容过大，已截断）：**\n\`\`\`\n${text.slice(0, 2000)}\n...\n[完整内容共 ${text.length} 字符，约 ${textTokens} tokens]\n\`\`\`\n`;
          } else {
            attachmentInfo += `\n**文件内容：**\n\`\`\`\n${text}\n\`\`\`\n`;
            totalAttachmentTokens += textTokens;
          }
        } else if (attachment.extractedContent?.preview) {
          attachmentInfo += `\n**文件预览：**\n\`\`\`\n${attachment.extractedContent.preview}\n\`\`\`\n`;
        }
        attachmentInfos.push(attachmentInfo);
      }

      if (attachmentInfos.length > 0) {
        const textPart = contentParts.find((p) => p.type === 'text');
        const attachmentText = '\n\n---\n**用户上传了以下附件：**' + attachmentInfos.join('');
        if (textPart) {
          textPart.text += attachmentText;
        } else {
          contentParts.unshift({ type: 'text', text: attachmentText });
        }
      }
    }

    if (contentParts.length > 0) {
      processedMessages.push({ ...msg, content: contentParts });
    } else {
      processedMessages.push(msg);
    }
  }

  return processedMessages;
}

/**
 * 构建 nanobot 风格的系统提示词（核心身份 + 时间 + Bootstrap + 内存 + 技能 + 工具）
 */
export async function buildNanobotStyleSystemPrompt(conversationId?: string): Promise<string> {
  try {
    const contextBuilder = getContextBuilder();
    const workspacePath = getWorkspacePath();
    const systemPrompt = await contextBuilder.buildSystemPrompt({
      workspacePath: workspacePath || undefined,
      includeMemory: true,
    });
    return systemPrompt;
  } catch (error: any) {
    console.error('[AgentRunner] Failed to build system prompt:', error.message);
    return `你是一个 AI 助手，可以帮助用户完成各种任务。`;
  }
}

/**
 * 格式化工具结果为发送给 LLM 的 content 字符串
 */
function formatToolResultContent(result: any): string {
  if (!result.success) {
    return `Error: ${result.error || 'Unknown error'}`;
  }
  const r = result.result;
  if (r?._truncated && r._preview) {
    return r._preview;
  }
  const serialized = safeStringify(r);
  return typeof serialized === 'string' ? serialized : JSON.stringify(r ?? 'done');
}

/**
 * 修剪旧的工具输出（上下文压缩）
 */
function pruneToolOutputs(messages: any[], _currentTokens: number, _maxTokens: number): number {
  let pruned = 0;
  let nonSystemCount = 0;
  let protectStartIndex = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== 'system') {
      nonSystemCount++;
      if (nonSystemCount >= PROTECT_RECENT_TURNS) {
        protectStartIndex = i;
        break;
      }
    }
  }
  for (let i = 0; i < protectStartIndex; i++) {
    const msg = messages[i];
    if (msg.role !== 'tool') continue;
    const content = typeof msg.content === 'string' ? msg.content : '';
    if (content.length <= TOOL_OUTPUT_PRUNE_THRESHOLD) continue;
    if (content.includes('[已压缩')) continue;
    const originalSize = (content.length / 1024).toFixed(1);
    msg.content = `[已压缩: 工具输出 ${originalSize}KB，原始内容已省略以节省上下文空间]`;
    pruned++;
  }
  return pruned;
}

// ============================================================================
// 核心执行函数
// ============================================================================

export interface AgentTurnOptions {
  /** 当前对话 ID（可选；无则不绑定工具组状态） */
  conversationId?: string;
  /** 消息历史（不含 system 消息，内部构建并添加） */
  messages: any[];
  /** 流式推送目标（通常是 event.sender 或 mainWindow.webContents） */
  sender: WebContents;
  /** 触发来源 */
  source?: 'user' | 'cron' | 'heartbeat';
}

export interface AgentTurnResult {
  success: boolean;
  content?: string;
  /** 完整消息序列（不含 system），供前端下次使用或持久化 */
  messages?: any[];
  error?: string;
}

/**
 * 执行一次完整的 agent turn：构建 system prompt → 工具循环 → 流式推送。
 *
 * 行为等价于原 chat:stream handler 的核心逻辑。
 * 新 turn 启动会自动 abort 上一个进行中的 turn。
 */
export async function runAgentTurn(opts: AgentTurnOptions): Promise<AgentTurnResult> {
  const { conversationId, sender, source = 'user' } = opts;
  let messages = opts.messages;

  const sourceTag = `[AgentRunner/${source}]`;

  try {
    // -------- 获取并校验配置 --------
    const appConfigStore = getAppConfigStore();
    const config = appConfigStore.getActiveConfig();

    if (!config) {
      throw new Error('未找到有效配置，请先在设置中配置模型信息');
    }
    if (!config.apiKey) {
      throw new Error('请先配置 API Key');
    }

    // -------- 中断上一个 turn，建立新的 AbortController --------
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    currentAbortController = new AbortController();

    // 把 WebContents 存到 globalThis，供 ask_user 等工具向渲染进程发事件
    (globalThis as any)[Symbol.for('zero-employee:chatWebContents')] = sender;

    const client = new OpenAIClient(
      config.baseUrl,
      config.apiKey,
      config.model,
      config.temperature,
      config.maxTokens
    );
    currentClient = client;

    const thinkingMode: ThinkingMode = appConfigStore.getThinkingMode();

    // -------- 重置工具组状态（每次对话从基础工具开始）--------
    if (conversationId) {
      toolManager.resetForConversation(conversationId);
    }

    // -------- 构建 system prompt 并前置 --------
    const systemPromptContent = await buildNanobotStyleSystemPrompt(conversationId);
    messages = [{ role: 'system' as const, content: systemPromptContent }, ...messages];

    // -------- 处理附件 --------
    const modelCapabilities = config.capabilities || detectCapabilities(config.model);
    messages = processAttachmentsInMessages(messages, modelCapabilities);

    // -------- 获取当前激活的工具定义 --------
    let tools = conversationId
      ? toolManager.getActiveToolDefinitions(conversationId)
      : toolManager.getOpenAIFunctionDefinitions();

    // -------- 工具调用计数与历史 --------
    const toolCallHistory: string[] = [];
    let totalToolCalls = 0;
    let iteration = 0;
    const MAX_TOTAL_TOOL_CALLS = appConfigStore.getMaxTotalToolCalls();
    const MAX_SINGLE_TOOL_CALLS = appConfigStore.getMaxSingleToolCalls();
    const toolCallCounter = new Map<string, number>();

    let roundChunks: string[] = [];

    // -------- 工具调用主循环 --------
    while (true) {
      iteration++;
      if (iteration % 10 === 0) {
        console.log(`${sourceTag} Tool iteration count: ${iteration}`);
      }

      // token 统计 + 上下文压缩
      let currentTokens = countContextTokens(messages, systemPromptContent, tools);
      const maxTokens = config.maxTokens || 128000;
      const tokenPercentage = (currentTokens / maxTokens) * 100;

      if (tokenPercentage > 85) {
        console.log(`${sourceTag} Token usage at ${tokenPercentage.toFixed(1)}%, pruning...`);
        const pruned = pruneToolOutputs(messages, currentTokens, maxTokens);
        if (pruned > 0) {
          currentTokens = countContextTokens(messages, systemPromptContent, tools);
          const newPercentage = (currentTokens / maxTokens) * 100;
          console.log(`${sourceTag} Pruned ${pruned}, ${tokenPercentage.toFixed(1)}% → ${newPercentage.toFixed(1)}%`);
          sender.send('chat:context_compressed', {
            pruned,
            oldPercentage: tokenPercentage,
            newPercentage,
          });
        }
      }

      sender.send('chat:token_usage', {
        current: currentTokens,
        max: maxTokens,
        percentage: tokenPercentage > 85 ? (currentTokens / maxTokens) * 100 : tokenPercentage,
        compressedCount: 0,
      });

      let hasToolCalls = false;
      roundChunks = [];
      const roundNumber = iteration;
      let chunkCount = 0;

      // 清理 thinkingContent（不发给 LLM）
      const cleanedMessages = messages.map(m => {
        if ((m as any).thinkingContent) {
          const { thinkingContent, ...rest } = m as any;
          return rest;
        }
        return m;
      });

      for await (const chunk of client.streamChat(cleanedMessages, currentAbortController.signal, tools, thinkingMode)) {
        chunkCount++;

        // tool_call_delta 中间事件
        if (chunk.startsWith('{"type":"tool_call_delta"') || chunk.startsWith('{"type": "tool_call_delta"')) {
          try {
            const delta = JSON.parse(chunk);
            sender.send('chat:tool_call_writing', {
              toolCallId: delta.id || `pending_${delta.index}`,
              name: delta.functionName,
              status: 'writing',
              argLength: delta.argumentsLength,
              timestamp: Date.now(),
            });
          } catch {}
          continue;
        }

        // tool_calls 完整事件
        if (chunk.startsWith('{"type":"tool_calls"') || chunk.startsWith('{"type": "tool_calls"')) {
          try {
            const parsed = JSON.parse(chunk);
            if (parsed.type === 'tool_calls') {
              hasToolCalls = true;
              totalToolCalls += parsed.toolCalls.length;

              const textContent = roundChunks.length > 0 ? roundChunks.join('') : '';
              roundChunks = [];

              // 重复调用检测（仅记录）
              for (const toolCall of parsed.toolCalls) {
                const callKey = `${toolCall.function.name}:${JSON.stringify(toolCall.function.arguments)}`;
                const sameCallCount = toolCallHistory.filter(k => k === callKey).length;
                if (sameCallCount >= 3 && sameCallCount % 3 === 0) {
                  console.warn(`${sourceTag} Repeated tool call: ${callKey} (${sameCallCount} times)`);
                }
                toolCallHistory.push(callKey);
              }

              // 单工具/总工具调用次数限制
              let hitTotalLimit = false;
              for (const call of parsed.toolCalls) {
                const toolCount = (toolCallCounter.get(call.function.name) || 0) + 1;
                toolCallCounter.set(call.function.name, toolCount);
                if (toolCount >= MAX_SINGLE_TOOL_CALLS) {
                  console.warn(`${sourceTag} Tool "${call.function.name}" called ${toolCount} times (limit ${MAX_SINGLE_TOOL_CALLS})`);
                  messages.push({
                    role: 'system',
                    content: `警告：工具 "${call.function.name}" 已调用 ${toolCount} 次，请检查是否有更高效的方式或直接总结。`,
                  });
                }
              }
              if (totalToolCalls >= MAX_TOTAL_TOOL_CALLS) {
                console.warn(`${sourceTag} Total tool calls reached limit: ${totalToolCalls}/${MAX_TOTAL_TOOL_CALLS}`);
                messages.push({
                  role: 'system',
                  content: `工具调用总次数已达上限（${MAX_TOTAL_TOOL_CALLS}次），请立即总结当前结果并回复用户。`,
                });
                hitTotalLimit = true;
              }

              sender.send('chat:tool_calls', parsed.toolCalls);

              const startTimes = new Map<string, number>();
              try {
                for (const toolCall of parsed.toolCalls) {
                  const startTime = Date.now();
                  startTimes.set(toolCall.id, startTime);
                  const tool = toolManager.getTool(toolCall.function.name);
                  const description = tool?.description || '';
                  sender.send('chat:tool_start', {
                    toolCallId: toolCall.id,
                    name: toolCall.function.name,
                    arguments: toolCall.function.arguments,
                    description,
                    timestamp: startTime,
                  });
                }

                const results = await toolManager.executeToolCalls(parsed.toolCalls, conversationId);

                // 处理 activate_toolset
                let toolsetActivated = false;
                for (let i = 0; i < results.length; i++) {
                  const result = results[i];
                  const endTime = Date.now();
                  const startTime = startTimes.get(result.toolCallId) || endTime;
                  const duration = endTime - startTime;

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
                      results[i].result = activateResult;
                      sender.send('chat:tools_loaded', {
                        group: args.toolset,
                        reason: 'Explicitly activated by model',
                        toolCount: activateResult.tools?.length || 0,
                      });
                    }
                  }

                  sender.send('chat:tool_complete', {
                    toolCallId: result.toolCallId,
                    duration,
                    success: result.success,
                    timestamp: endTime,
                  });
                }

                if (toolsetActivated && conversationId) {
                  tools = toolManager.getActiveToolDefinitions(conversationId);
                }

                sender.send('chat:tool_results', results);

                // assistant 消息：文本 + tool_calls 合并（OpenAI 规范）
                messages.push({
                  id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  role: 'assistant',
                  content: textContent || null,
                  tool_calls: parsed.toolCalls,
                });

                for (const result of results) {
                  messages.push({
                    role: 'tool',
                    tool_call_id: result.toolCallId,
                    content: formatToolResultContent(result),
                  });
                }

                if (hitTotalLimit) {
                  console.log(`${sourceTag} Total tool call limit reached, breaking`);
                  hasToolCalls = false;
                }
                break;
              } catch (toolError: any) {
                console.error(`${sourceTag} Tool execution error:`, toolError);
                throw toolError;
              }
            }
          } catch (e) {
            console.warn(`${sourceTag} Failed to parse tool_calls JSON:`, chunk.substring(0, 50));
          }
        } else {
          // 非工具调用：普通文本或思考内容
          if (chunk.startsWith('\x01THINKING\x02')) {
            sender.send('chat:chunk', chunk);
          } else {
            roundChunks.push(chunk);
            sender.send('chat:chunk', chunk);
          }
        }
      }

      if (hasToolCalls) {
        // 继续下一轮
      } else {
        if (roundChunks.length === 0) {
          console.warn(`${sourceTag} Round ${roundNumber}: no tool calls AND no content`);
        }
        break;
      }
    }

    // 最终 assistant 消息
    if (roundChunks.length > 0) {
      const finalContent = roundChunks.join('');
      messages.push({
        id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: finalContent,
      });
    }

    currentClient = null;
    currentAbortController = null;

    const apiMessages = messages.filter(m => m.role !== 'system');
    return {
      success: true,
      content: roundChunks.join(''),
      messages: apiMessages,
    };
  } catch (error: any) {
    const status = error.response?.status;
    const isRateLimit = status === 429;

    console.error(`\n========== AgentRunner Error (${source}) ==========`);
    console.error('Status:', status || 'Unknown');
    console.error('Message:', error.message);
    if (error.response?.data) {
      console.error('Response Data:', safeStringify(error.response.data));
    }
    if (error.config?.url) {
      console.error('Request URL:', error.config.url);
    }
    if (error.config?.data) {
      const requestData = error.config.data;
      const dataSize = typeof requestData === 'string' ? requestData.length : safeStringify(requestData).length;
      console.error('Request Body Size:', `${(dataSize / 1024).toFixed(2)} KB`);
    }
    if (isRateLimit) {
      console.error('Type: Rate Limit Exceeded (429)');
    }
    console.error('=================================================\n');

    currentClient = null;
    currentAbortController = null;

    let errorMessage = error.message;
    if (error.response?.data?.error?.message) {
      errorMessage = error.response.data.error.message;
    } else if (error.response?.data?.error) {
      errorMessage = safeStringify(error.response.data.error);
    }
    if (status) {
      errorMessage = `[${status}] ${errorMessage}`;
    }

    return {
      success: false,
      error: isRateLimit ? '请求过于频繁，请稍后再试' : errorMessage,
    };
  }
}
