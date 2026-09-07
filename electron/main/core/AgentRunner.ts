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

/**
 * 是否有 agent turn 正在执行（供 bridge 等外部入口做互斥，
 * 避免并发 turn 触发单例 AbortController 静默打断用户进行中的对话）
 */
export function isAgentTurnRunning(): boolean {
  return currentAbortController !== null;
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
 *
 * 2026-09-07 重写（opencode 风格）：不再把整个结果对象 safeStringify 成带转义
 * 引号的 JSON 瀑布（信噪比低、浪费 token 且模型易看漏关键信息），改为：
 *   1. 主内容字段（content/output/stdout/message）直接作为正文
 *   2. 关键元数据（文件路径/大小/exitCode 等）压缩为一行脚注
 *   3. 无主内容字段时兜底紧凑序列化（剔除 structured 等大块噪音）
 */
function formatToolResultContent(result: any): string {
  if (!result.success) {
    const err = result.error ?? result.stderr ?? 'Unknown error';
    return `Error: ${typeof err === 'string' ? err : safeStringify(err)}`;
  }
  const r = result.result;
  if (r?._truncated && r._preview) {
    return r._preview;
  }
  if (r == null) return 'done';
  if (typeof r === 'string') return r || 'done';
  if (typeof r !== 'object') return String(r);

  const parts: string[] = [];

  // 1. 主内容字段：优先级 content > output > stdout > message
  const main = r.content ?? r.output ?? r.stdout ?? r.message;
  if (typeof main === 'string' && main.length > 0) {
    parts.push(main);
  } else {
    // 没有主内容字段：紧凑序列化其余字段（剔除主内容字段和 structured）
    const { content, output, stdout, message, structured, _preview, _truncated, ...rest } = r;
    const keys = Object.keys(rest);
    if (keys.length > 0) parts.push(safeStringify(rest));
  }

  // 2. stderr 即使成功也可能带警告信息，非空则附上
  if (typeof r.stderr === 'string' && r.stderr.length > 0) {
    parts.push(`[stderr] ${r.stderr}`);
  }

  // 3. 元数据脚注（单行）
  const metaKeys = ['fullPath', 'file', 'path', 'count', 'totalMatches', 'exitCode', 'executionMethod', 'size'];
  const meta = metaKeys
    .filter(k => r[k] !== undefined && r[k] !== null && typeof r[k] !== 'object')
    .map(k => `${k}=${r[k]}`);
  if (meta.length > 0) parts.push(`(${meta.join(' | ')})`);

  return parts.join('\n') || 'done';
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
  source?: 'user' | 'cron' | 'heartbeat' | 'bridge';
}

export interface AgentTurnResult {
  success: boolean;
  content?: string;
  /** 完整消息序列（不含 system），供前端下次使用或持久化 */
  messages?: any[];
  error?: string;
}

/**
 * 将前端/DB 中的消息规整为 OpenAI API 要求的格式：
 *  - tool 角色消息：camelCase `toolCallId` → snake_case `tool_call_id`
 *  - assistant 消息：camelCase `toolCalls` → snake_case `tool_calls`
 *  - 丢弃没有 tool_call_id 的孤儿 tool 消息（否则 API 报 400 missing field `tool_call_id`）
 *  - 丢弃前导/孤立的 tool 消息（前面没有对应 assistant tool_calls）
 *  - 悬空 tool_calls 补占位结果：turn 被 abort/网络中断时，assistant 的 tool_calls
 *    已入历史但 tool 结果缺失，API 会报 400 "insufficient tool messages following
 *    tool_calls message"——为缺失的 tool_call_id 注入占位 tool 消息
 */
function normalizeMessagesForLLM(input: any[]): any[] {
  if (!Array.isArray(input)) return [];
  // 第一遍：字段标准化 + 过滤无效 tool 消息
  const normalized = input.map((m: any) => {
    if (!m || typeof m !== 'object') return null;
    const role = m.role;
    if (role === 'tool') {
      const toolCallId = m.tool_call_id ?? m.toolCallId;
      if (!toolCallId) {
        console.warn('[AgentRunner] Drop tool message without tool_call_id');
        return null;
      }
      return {
        ...m,
        role: 'tool',
        tool_call_id: toolCallId,
        content: m.content ?? '',
      };
    }
    if (role === 'assistant') {
      const toolCalls = m.tool_calls ?? m.toolCalls;
      const out: any = {
        ...m,
        role: 'assistant',
      };
      if (toolCalls) out.tool_calls = toolCalls;
      return out;
    }
    return m;
  }).filter(Boolean);

  // 第二遍：丢弃孤儿 tool 消息（前面找不到匹配的 assistant tool_calls）
  const validToolCallIds = new Set<string>();
  for (const m of normalized as any[]) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls) {
        if (tc?.id) validToolCallIds.add(tc.id);
      }
    }
  }
  const filtered = (normalized as any[]).filter((m: any) => {
    if (m.role === 'tool' && !validToolCallIds.has(m.tool_call_id)) {
      console.warn(`[AgentRunner] Drop orphan tool message tool_call_id=${m.tool_call_id}`);
      return false;
    }
    return true;
  });

  // 第三遍：保证每个 assistant tool_calls 后紧跟完整的 tool 结果
  // - tool 结果缺失（turn 被 abort/断网中断）→ 注入占位 tool 消息
  // - 错位的 tool 消息（不紧跟在对应 assistant 之后，如被 user 消息隔开）→ 丢弃
  const result: any[] = [];
  for (let i = 0; i < filtered.length; i++) {
    const m = filtered[i];
    if (m.role === 'tool') {
      console.warn(`[AgentRunner] Drop misplaced tool message tool_call_id=${m.tool_call_id}`);
      continue;
    }
    result.push(m);
    if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      // 收集紧随其后的连续 tool 消息
      const responded = new Set<string>();
      let j = i + 1;
      while (j < filtered.length && filtered[j].role === 'tool') {
        responded.add(filtered[j].tool_call_id);
        j++;
      }
      // 为缺失的 tool_call_id 补占位结果
      for (const tc of m.tool_calls) {
        if (tc?.id && !responded.has(tc.id)) {
          console.warn(`[AgentRunner] Inject placeholder tool result for missing tool_call_id=${tc.id}`);
          result.push({
            role: 'tool',
            tool_call_id: tc.id,
            content: '[工具执行被中断，没有返回结果]',
          });
        }
      }
      // 已有的 tool 结果按原顺序放回
      for (let k = i + 1; k < j; k++) result.push(filtered[k]);
      i = j - 1;
    }
  }
  return result;
}

/**
 * 执行一次完整的 agent turn：构建 system prompt → 工具循环 → 流式推送。
 *
 * 行为等价于原 chat:stream handler 的核心逻辑。
 * 新 turn 启动会自动 abort 上一个进行中的 turn。
 */
export async function runAgentTurn(opts: AgentTurnOptions): Promise<AgentTurnResult> {
  const { conversationId, sender, source = 'user' } = opts;
  let messages = normalizeMessagesForLLM(opts.messages);

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
    // 注意：bridge/cron/heartbeat 可能并发跑 turn，此单例只用于"中断上一个"；
    // 本 turn 必须用局部引用，避免并发 turn 把单例置空后读到 null
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    const turnController = new AbortController();
    currentAbortController = turnController;

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
    // 重复失败检测：只记录"执行失败"的相同调用（相同参数且成功属正常轮询，不告警）
    const failedToolCalls: string[] = [];
    let totalToolCalls = 0;
    let iteration = 0;
    const MAX_SINGLE_TOOL_CALLS = appConfigStore.getMaxSingleToolCalls();
    const toolCallCounter = new Map<string, number>();

    let roundChunks: string[] = [];
    // 本轮思考内容（reasoning_content）：DeepSeek 思考模式要求所有 assistant
    // 消息（含最终答复）续传时回传 reasoning_content，因此每轮都要收集
    let roundThinking: string[] = [];

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
      roundThinking = [];
      const roundNumber = iteration;
      let chunkCount = 0;

      // 清理思考内容：
      // - DeepSeek 等思考模式模型要求：只要请求带 tools，历史中所有 assistant
      //   消息（包括无 tool_calls 的最终答复）续传时都必须带回 reasoning_content，
      //   否则 400（官方文档："even if the model did not perform a tool call in that turn"）
      // - 非 assistant 消息剥离思考字段；assistant 消息统一转成 reasoning_content
      //   是否真正发送由 openai.ts 的 sanitizeMessages 按 provider 决定
      const cleanedMessages = messages.map(m => {
        const msg = m as any;
        if (msg.role !== 'assistant') return m;
        const thinking = msg.thinkingContent ?? msg.reasoning_content;
        const { thinkingContent, reasoning_content, ...rest } = msg;
        if (!thinking) return rest;
        return { ...rest, reasoning_content: thinking };
      });

      for await (const chunk of client.streamChat(cleanedMessages, turnController.signal, tools, thinkingMode)) {
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

              // 重复调用检测（相同参数且每次都失败时注入强提醒，防止死循环空转）
              // 仅统计失败的调用：task_list 等轮询型工具被正常重复调用不应被误伤
              // 2026-09-07：干预阈值从 5 次收紧到 2 次（评测发现 3 连败时模型已在盲试），
              // 第 4 次起升级为"换方法或停下"，避免烧上下文
              const roundCallKeys: string[] = [];
              let warnedThisRound = false;
              for (const toolCall of parsed.toolCalls) {
                const callKey = `${toolCall.function.name}:${JSON.stringify(toolCall.function.arguments)}`;
                roundCallKeys.push(callKey);
                const failedCount = failedToolCalls.filter(k => k === callKey).length;
                if (failedCount >= 2 && !warnedThisRound) {
                  warnedThisRound = true;
                  console.warn(`${sourceTag} Repeated failed tool call: ${callKey} (${failedCount} times)`);
                  const hint = failedCount >= 4
                    ? '已连续多次失败，禁止再用相同方式重试。请改用完全不同的实现方法（例如改用 bash + python 脚本完成），或如实向用户说明卡点后停止。'
                    : '请：1) 仔细阅读最近一次工具返回的错误信息（含出错位置和建议）；2) 改变参数写法（如把嵌套 JSON 字符串改为直接数组、补齐缺失的必填参数）；3) 缩小规模分步完成（先建 1 个 sheet，再用追加方式加内容）。';
                  messages.push({
                    role: 'user',
                    content: `[系统警告] "${toolCall.function.name}" 用完全相同的参数已连续失败 ${failedCount} 次，禁止再提交相同参数。${hint}`,
                  });
                }
              }

              // 单工具/总工具调用次数追踪（单工具超阈值时仅注入柔性提醒，不强制中断）
              for (const call of parsed.toolCalls) {
                const toolCount = (toolCallCounter.get(call.function.name) || 0) + 1;
                toolCallCounter.set(call.function.name, toolCount);
                if (toolCount >= MAX_SINGLE_TOOL_CALLS && toolCount % MAX_SINGLE_TOOL_CALLS === 0) {
                  console.warn(`${sourceTag} Tool "${call.function.name}" called ${toolCount} times`);
                  // 注意：不能用 role: 'system'，否则会违反"system 消息只能在开头"的 API 约束
                  messages.push({
                    role: 'user',
                    content: `[系统提醒] 工具 "${call.function.name}" 已调用 ${toolCount} 次，请检查是否有更高效的方式或直接总结。`,
                  });
                }
              }
              if (totalToolCalls > 0 && totalToolCalls % 50 === 0) {
                console.log(`${sourceTag} Total tool calls: ${totalToolCalls}`);
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

                // 记录失败调用（供重复失败检测；results[i] 与 parsed.toolCalls[i] 按 toolCallId 对应）
                results.forEach((result, i) => {
                  if (!result.success && roundCallKeys[i]) {
                    failedToolCalls.push(roundCallKeys[i]);
                  }
                });

                // assistant 消息：文本 + tool_calls 合并（OpenAI 规范）
                // 思考模式的 reasoning_content 必须随消息保留：本轮续传时回传给 API（DeepSeek 要求），
                // 同时存为 thinkingContent 字段便于持久化
                const roundThinkingText = roundThinking.join('');
                messages.push({
                  id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  role: 'assistant',
                  content: textContent || null,
                  tool_calls: parsed.toolCalls,
                  ...(roundThinkingText ? { reasoning_content: roundThinkingText, thinkingContent: roundThinkingText } : {}),
                });

                for (const result of results) {
                  messages.push({
                    role: 'tool',
                    tool_call_id: result.toolCallId,
                    content: formatToolResultContent(result),
                  });
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
            roundThinking.push(chunk.substring('\x01THINKING\x02'.length));
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
    // DeepSeek 思考模式：只要请求带 tools，最终答复（无 tool_calls）也必须带
    // reasoning_content 回传，否则下一轮 400（官方文档明确要求）
    if (roundChunks.length > 0) {
      const finalContent = roundChunks.join('');
      const finalThinking = roundThinking.join('');
      messages.push({
        id: `assistant-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: finalContent,
        ...(finalThinking ? { reasoning_content: finalThinking, thinkingContent: finalThinking } : {}),
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
