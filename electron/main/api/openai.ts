import axios from 'axios';
import { ThinkingMode } from '../config/AppConfigStore';

/**
 * 流式 <think>...</think> 标签解析器（状态机）
 *
 * 用于处理将思考内容写在 content 字段里（而非 reasoning_content）的模型。
 * 维护跨 chunk 的解析状态，正确处理：
 * - 标签被拆分到多个 chunk 的情况（缓冲尾部可能的标签前缀）
 * - 多对 <think>...</think> 标签
 * - 未闭合的 <think> 标签（stream end 时 flush）
 *
 * 用法：
 *   const parser = new ThinkTagParser();
 *   for each chunk: const pieces = parser.feed(chunk);
 *   at end: const trailing = parser.flush();
 */
class ThinkTagParser {
  private inThink = false;
  /**
   * "单边闭合"模式标志：当模型只输出 `</think>` 而无 `<think>` 开标签时启用。
   * 一旦识别到此模式，outside 状态下遇到 `</think>` 会把之前累积的 content 视为 thinking。
   */
  private soloCloseMode = false;
  private buffer = '';

  /** 匹配可能被截断的 <think> 开标签前缀（如 "<t", "<th", ..., "<think "） */
  private static readonly PARTIAL_OPEN = /<t(?:h(?:i(?:n(?:k(?:\s+)?)?)?)?)?$/i;
  /** 匹配可能被截断的 </think> 闭标签前缀 */
  private static readonly PARTIAL_CLOSE = /<\/t(?:h(?:i(?:n(?:k(?:\s+)?)?)?)?)?$/i;

  feed(text: string): Array<{ type: 'thinking' | 'content'; text: string }> {
    this.buffer += text;
    const out: Array<{ type: 'thinking' | 'content'; text: string }> = [];
    const OPEN_TAG = /<think\s*>/gi;
    const CLOSE_TAG = /<\/think\s*>/gi;

    let safety = 200; // 防止意外死循环
    while (this.buffer.length > 0 && safety-- > 0) {
      if (this.inThink) {
        CLOSE_TAG.lastIndex = 0;
        const match = this.buffer.match(CLOSE_TAG);
        if (match && match.index !== undefined) {
          const before = this.buffer.substring(0, match.index);
          if (before) out.push({ type: 'thinking', text: before });
          this.buffer = this.buffer.substring(match.index + match[0].length);
          this.inThink = false;
        } else {
          // 没找到闭标签。检查 buffer 尾部是否有可能是 </think 前缀
          const partial = this.buffer.match(ThinkTagParser.PARTIAL_CLOSE);
          if (partial && partial.index !== undefined) {
            if (partial.index > 0) {
              out.push({ type: 'thinking', text: this.buffer.substring(0, partial.index) });
            }
            this.buffer = this.buffer.substring(partial.index);
          } else {
            if (this.buffer) out.push({ type: 'thinking', text: this.buffer });
            this.buffer = '';
          }
          break; // 等待更多 chunk
        }
      } else {
        // outside 状态：同时查找 OPEN_TAG 和 CLOSE_TAG，比较谁先出现
        OPEN_TAG.lastIndex = 0;
        CLOSE_TAG.lastIndex = 0;
        const openMatch = this.buffer.match(OPEN_TAG);
        const closeMatch = this.buffer.match(CLOSE_TAG);
        const openIdx = openMatch && openMatch.index !== undefined ? openMatch.index : -1;
        const closeIdx = closeMatch && closeMatch.index !== undefined ? closeMatch.index : -1;

        // 检测单边闭合模式：CLOSE 出现且早于 OPEN（或没有 OPEN）
        // 一旦进入 soloCloseMode，后续的 CLOSE 都按单边规则处理
        if (closeIdx !== -1 && (openIdx === -1 || closeIdx < openIdx)) {
          // 把 </think> 之前的内容视为 thinking
          const before = this.buffer.substring(0, closeIdx);
          if (before) out.push({ type: 'thinking', text: before });
          this.buffer = this.buffer.substring(closeIdx + closeMatch![0].length);
          this.soloCloseMode = true;
          // 保持在 outside 状态；之后的内容作为 content，直到再次遇到 </think>
          continue;
        }

        if (openIdx !== -1) {
          const before = this.buffer.substring(0, openIdx);
          if (before) out.push({ type: 'content', text: before });
          this.buffer = this.buffer.substring(openIdx + openMatch![0].length);
          this.inThink = true;
        } else {
          // 单边闭合模式下，缓冲尾部可能有部分 </think 前缀需要保留
          const partial = this.soloCloseMode
            ? this.buffer.match(ThinkTagParser.PARTIAL_CLOSE)
            : this.buffer.match(ThinkTagParser.PARTIAL_OPEN);
          if (partial && partial.index !== undefined) {
            if (partial.index > 0) {
              // 单边模式下，partial 之前的内容仍按 content 输出（等待确认是否还有 </think>）
              out.push({ type: 'content', text: this.buffer.substring(0, partial.index) });
            }
            this.buffer = this.buffer.substring(partial.index);
          } else {
            if (this.buffer) out.push({ type: 'content', text: this.buffer });
            this.buffer = '';
          }
          break;
        }
      }
    }
    return out;
  }

  /** 流结束时调用，冲刷残留 buffer */
  flush(): Array<{ type: 'thinking' | 'content'; text: string }> {
    if (!this.buffer) return [];
    const result = [{ type: (this.inThink ? 'thinking' : 'content') as 'thinking' | 'content', text: this.buffer }];
    this.buffer = '';
    this.inThink = false;
    this.soloCloseMode = false;
    return result;
  }
}

/**
 * 安全的 JSON.stringify，处理循环引用
 */
function safeStringify(obj: any, indent?: number | string): string {
  const cache = new Set();
  return JSON.stringify(
    obj,
    (_key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (cache.has(value)) {
          return '[Circular]';
        }
        cache.add(value);
      }
      return value;
    },
    indent
  );
}

/**
 * 清理消息，只保留 OpenAI API 规范字段
 * 移除非标准字段（id、thinkingContent、images、attachments 等）
 * DashScope 等严格 API 会对非标准字段返回 400 错误
 *
 * 额外防护：强制 system 消息只能出现在数组开头。
 * 某些代码路径（工具次数警告、上下文压缩摘要）可能错误地在中间插入 system 消息，
 * 这会触发 "System message must be at the beginning of the conversation" 400 错误。
 * 这里将任何非首位的 system 消息降级为 user 消息作为兜底。
 */
function sanitizeMessages(messages: any[]): any[] {
  return messages.map((msg, idx) => {
    // 兜底：非首位的 system 消息降级为 user，避免 400 错误
    let role = msg.role;
    if (role === 'system' && idx > 0) {
      role = 'user';
    }

    switch (role) {
      case 'system':
        return { role, content: msg.content };

      case 'user':
        // content 可以是字符串或多模态数组
        return { role, content: msg.content };

      case 'assistant': {
        const clean: any = { role };
        if (msg.tool_calls) {
          // 有 tool_calls 时，空 content 应为 null
          clean.content = msg.content || null;
          clean.tool_calls = msg.tool_calls;
        } else {
          clean.content = msg.content;
        }
        return clean;
      }

      case 'tool':
        return {
          role,
          content: msg.content,
          tool_call_id: msg.tool_call_id,
        };

      default:
        return { role, content: msg.content };
    }
  });
}

export class OpenAIClient {
  private axiosInstance: any;

  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    private temperature: number,
    private maxTokens: number
  ) {
    this.axiosInstance = axios.create();
    this.setupInterceptors();
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(
      (config: any) => {
        // 打印请求详情用于调试
        console.log('[Axios] Request:', {
          url: config.url,
          method: config.method,
          model: config.data?.model,
          messageCount: config.data?.messages?.length,
          hasTools: config.data?.tools?.length > 0,
          maxTokens: config.data?.max_tokens,
        });
        return config;
      },
      (error: any) => {
        console.error('[Axios Request Error]:', error.message);
        return Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response: any) => {
        return response;
      },
      (error: any) => {
        const status = error.response?.status;
        console.error('\n========== Axios Response Error ==========');
        console.error('Status:', status || 'No status');
        console.error('Message:', error.message);

        // 详细打印响应错误数据
        if (error.response?.data) {
          const errorData = error.response.data;
          if (typeof errorData === 'object') {
            console.error('Response Data:', safeStringify(errorData, 2));
            // 特别提取错误信息
            if (errorData.error) {
              console.error('API Error Type:', errorData.error.type);
              console.error('API Error Message:', errorData.error.message);
              console.error('API Error Code:', errorData.error.code);
            }
          } else {
            console.error('Response Data (raw):', errorData);
          }
        }
        if (error.config?.url) {
          console.error('Request URL:', error.config.url);
        }
        if (error.config?.data) {
          // 打印请求体摘要（避免打印大量二进制数据）
          try {
            const requestData = typeof error.config.data === 'string'
              ? JSON.parse(error.config.data)
              : error.config.data;
            console.error('Request Body Summary:', {
              model: requestData.model,
              messageCount: requestData.messages?.length,
              hasTools: requestData.tools?.length > 0,
              maxTokens: requestData.max_tokens,
              temperature: requestData.temperature,
            });
          } catch (e) {
            // 如果解析失败，只打印基本信息
            console.error('Request Body: [unable to parse]');
          }
        }
        if (error.code) {
          console.error('Error Code:', error.code);
        }

        // 如果是 400 错误，特别提示模型名称问题
        if (status === 400) {
          console.error('\n>>> 400 Bad Request - 可能的原因:');
          console.error('    1. 模型名称格式不正确（检查是否与 API 文档一致）');
          console.error('    2. max_tokens 超出模型限制');
          console.error('    3. 请求参数格式问题');
          console.error('    请查看上方 "API Error Message" 获取具体错误原因\n');
        }

        console.error('==========================================\n');
        return Promise.reject(error);
      }
    );
  }

  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await this.axiosInstance.get(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (response.status >= 200 && response.status < 300) {
        // 打印可用模型列表，帮助用户确认正确的模型名称
        if (response.data?.data) {
          const modelIds = response.data.data.map((m: any) => m.id).sort();
          console.log('[OpenAIClient] Available models:', modelIds.join(', '));

          // 检查当前配置的模型是否在列表中
          if (this.model && !modelIds.includes(this.model)) {
            console.warn(`[OpenAIClient] Warning: Model "${this.model}" not found in available models`);
            // 尝试找到相似的模型名称
            const similar = modelIds.filter((id: string) =>
              id.toLowerCase().includes(this.model.toLowerCase().replace(/[-_]/g, ''))
            );
            if (similar.length > 0) {
              console.log('[OpenAIClient] Similar models found:', similar.join(', '));
            }
          }
        }
        return { valid: true };
      }

      return {
        valid: false,
        error: 'API 验证失败',
      };
    } catch (error: any) {
      return {
        valid: false,
        error: error.response?.data?.error?.message || error.message || '网络错误，请检查 API 地址',
      };
    }
  }

  // 获取模型信息和推荐的 maxTokens
  async getModelInfo(): Promise<{ maxTokens?: number; modelInfo?: any }> {
    try {
      // 尝试从 /models 端点获取模型列表
      const response = await this.axiosInstance.get(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (response.data && response.data.data) {
        // 查找当前模型
        const currentModel = response.data.data.find((m: any) => m.id === this.model);

        if (currentModel) {
          // 从模型信息中获取 max_tokens（某些 API 提供商会返回）
          const maxTokens = currentModel.max_tokens || this.getDefaultMaxTokens();
          return { maxTokens, modelInfo: currentModel };
        }
      }

      // 如果找不到特定模型信息，返回基于模型名称的默认值
      return { maxTokens: this.getDefaultMaxTokens() };
    } catch (error: any) {
      // 失败时返回基于模型名称的默认值
      return { maxTokens: this.getDefaultMaxTokens() };
    }
  }

  // 根据模型名称获取默认的 maxTokens
  private getDefaultMaxTokens(): number {
    const modelLower = this.model.toLowerCase();

    // GPT-4 系列
    if (modelLower.includes('gpt-4-turbo') || modelLower.includes('gpt-4-1106')) {
      return 128000;
    }
    if (modelLower.includes('gpt-4-32k')) {
      return 32768;
    }
    if (modelLower.includes('gpt-4')) {
      return 8192;
    }

    // GPT-3.5 系列
    if (modelLower.includes('gpt-3.5-turbo-16k')) {
      return 16385;
    }
    if (modelLower.includes('gpt-3.5-turbo')) {
      return 4096;
    }

    // Claude 系列（如果使用兼容 API）
    if (modelLower.includes('claude-3-opus')) {
      return 200000;
    }
    if (modelLower.includes('claude-3-sonnet')) {
      return 200000;
    }
    if (modelLower.includes('claude-3-haiku')) {
      return 200000;
    }
    if (modelLower.includes('claude-2')) {
      return 100000;
    }

    // Qwen 系列（新增）
    if (modelLower.includes('qwen3-8b') || modelLower.includes('qwen-3-8b')) {
      return 8192; // qwen3-8b 通常支持 8k 上下文
    }
    if (modelLower.includes('qwen')) {
      return 32768;
    }

    // 默认值
    return 4096;
  }

  async *streamChat(messages: any[], signal?: AbortSignal, tools?: any[], thinkingMode?: ThinkingMode): AsyncGenerator<string> {
    // 清理消息：移除非标准字段（id、thinkingContent 等），防止 DashScope 400 错误
    const sanitizedMessages = sanitizeMessages(messages);

    // 粗略估算请求体大小（使用 safeStringify 防止循环引用崩溃）
    const messagesStr = safeStringify(sanitizedMessages);
    const toolsStr = tools ? safeStringify(tools) : '';
    const estimatedSize = messagesStr.length + toolsStr.length;

    // 警告：请求体过大
    const SIZE_WARNING_THRESHOLD = 50000; // 50KB
    if (estimatedSize > SIZE_WARNING_THRESHOLD) {
      console.warn(`[OpenAIClient] Request body is large: ~${(estimatedSize / 1024).toFixed(2)} KB`);
      console.warn(`[OpenAIClient] This may exceed the model's context window and cause 400 errors`);
    }

    // max_tokens 是模型输出的 token 上限，而非上下文窗口大小
    // 用户配置的 maxTokens 代表上下文窗口，用于 token 计数
    // API 的 max_tokens 应限制为合理的输出长度，避免超大值导致 400 错误
    const MAX_OUTPUT_TOKENS = 16384;
    const outputTokens = Math.min(this.maxTokens, MAX_OUTPUT_TOKENS);

    const requestBody: any = {
      model: this.model,
      messages: sanitizedMessages,
      stream: true,
      temperature: this.temperature,
      max_tokens: outputTokens,
    };

    // 思考模式控制：通过 chat_template_kwargs 和顶层参数同时传递
    // VLLM 使用 chat_template_kwargs.enable_thinking
    // DashScope 使用顶层 enable_thinking
    // auto 模式不发送任何参数，使用服务器默认设置
    if (thinkingMode === 'enabled') {
      requestBody.chat_template_kwargs = { enable_thinking: true };
      requestBody.enable_thinking = true;
    } else if (thinkingMode === 'disabled') {
      requestBody.chat_template_kwargs = { enable_thinking: false };
      requestBody.enable_thinking = false;
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    console.log('[OpenAIClient] Sending request - model:', this.model, 'messages:', messages.length, 'tools:', tools?.length || 0);

    // 带重试的请求发送
    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000;
    let response: any;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        response = await this.axiosInstance.post(`${this.baseUrl}/chat/completions`, requestBody, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip, deflate, identity',
          },
          responseType: 'stream',
          signal,
          decompress: true,
          maxRedirects: 0,
        });
        break; // 成功，跳出重试循环
      } catch (error: any) {
        const status = error.response?.status;
        const isRetryable = status === 429 || status === 502 || status === 503 || status === 504;

        // 当 responseType: 'stream' 时，错误响应体是流对象而非 JSON
        // 需要消费流来获取实际的错误信息
        if (error.response?.data && typeof error.response.data.on === 'function') {
          try {
            const chunks: Buffer[] = [];
            for await (const chunk of error.response.data) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const errorText = Buffer.concat(chunks).toString('utf-8');
            try {
              error.response.data = JSON.parse(errorText);
            } catch {
              error.response.data = { error: { message: errorText.substring(0, 500) } };
            }
            console.error('[OpenAIClient] Error response body:', error.response.data);
          } catch (readErr) {
            console.error('[OpenAIClient] Failed to read error stream:', readErr);
          }
        }

        if (!isRetryable || attempt === MAX_RETRIES) {
          throw error;
        }

        const delay = BASE_DELAY * Math.pow(2, attempt) + Math.random() * 1000;
        console.warn(`[OpenAIClient] Retriable error ${status}, attempt ${attempt + 1}/${MAX_RETRIES}, retrying in ${Math.round(delay)}ms`);
        await new Promise(r => setTimeout(r, delay));
      }
    }

    const stream = response.data;
    // 使用 index → toolCall 的 Map 来支持并行工具调用
    const toolCallMap: Map<number, any> = new Map();
    let buffer = Buffer.alloc(0);
    let contentChunks: string[] = [];

    // <think>...</think> 标签解析器：某些模型（如 vLLM/DLMox）将思考内容
    // 直接写在 content 字段里（而非 reasoning_content），需要流式层实时识别并转换。
    // 解析后：think 标签内的内容 → \x01THINKING\x02 sentinel；标签外 → 正常 content。
    const thinkParser = new ThinkTagParser();

    for await (const chunk of stream) {
      // 按 Buffer 累积并只解码完整行：chunk 边界可能截断多字节 UTF-8 字符（如汉字），
      // 若对每个 chunk 单独 toString() 会产生 U+FFFD 乱码（"数据库��作"）
      buffer = Buffer.concat([buffer, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);

      const lines: string[] = [];
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf(0x0A)) !== -1) {
        lines.push(buffer.subarray(0, newlineIdx).toString('utf-8'));
        buffer = buffer.subarray(newlineIdx + 1);
      }

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '') continue;
        if (trimmed === 'data: [DONE]') {
          break;
        }
        if (!trimmed.startsWith('data: ')) {
          continue;
        }

        const jsonStr = trimmed.slice(6);

        try {
          const parsed = JSON.parse(jsonStr);

          const choice = parsed.choices?.[0];
          const delta = choice?.delta;
          const content = delta?.content;
          const reasoningContent = delta?.reasoning_content;
          const newToolCalls = delta?.tool_calls;

          // 诊断日志：记录 finish_reason 和非标准字段
          if (choice?.finish_reason) {
            console.log(`[OpenAIClient] finish_reason: ${choice.finish_reason}, contentChunks so far: ${contentChunks.length}, toolCallMap size: ${toolCallMap.size}`);
          }
          // 检测非标准位置可能藏着的 tool_calls（某些 provider 偏离 OpenAI 规范）
          if (choice?.message?.tool_calls && !newToolCalls) {
            console.warn('[OpenAIClient] Detected tool_calls in choice.message (non-standard), rescuing');
            for (const tc of choice.message.tool_calls) {
              const idx = tc.index ?? 0;
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, { id: tc.id || '', type: 'function', function: { name: '', arguments: '' } });
              }
              const acc = toolCallMap.get(idx);
              if (tc.id) acc.id = tc.id;
              if (tc.function?.name) acc.function.name = tc.function.name;
              if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
            }
          }

          // 处理思考内容（千问/QwQ/DeepSeek 等模型的 reasoning_content）
          if (reasoningContent) {
            yield `\x01THINKING\x02${reasoningContent}`;
          }

          if (content) {
            // 通过 ThinkTagParser 实时识别 <think>...</think> 标签。
            // 标签内的内容转换为 THINKING sentinel，标签外的作为正常 content。
            const pieces = thinkParser.feed(content);
            for (const piece of pieces) {
              if (piece.type === 'thinking') {
                yield `\x01THINKING\x02${piece.text}`;
              } else {
                contentChunks.push(piece.text);
                yield piece.text;
              }
            }
          }

          // 按 OpenAI 流式规范组装 tool_calls：
          // - 首个 chunk 包含 id, type, function.name
          // - 后续 chunk 仅包含 index + function.arguments 片段
          // - DashScope 可能返回 id: "" 而非 id: null
          if (newToolCalls) {
            for (const tc of newToolCalls) {
              const idx = tc.index ?? 0; // 兜底：某些 provider 可能不发送 index
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, {
                  id: tc.id || '',
                  type: 'function',
                  function: { name: '', arguments: '' },
                });
              }
              const acc = toolCallMap.get(idx);

              // 从任何 chunk 中提取 id（不限于首个 chunk）
              if (tc.id && tc.id !== '') {
                acc.id = tc.id;
              }

              // 提取 type（某些 provider 只在首 chunk 发送）
              if (tc.type) {
                acc.type = tc.type;
              }

              if (tc.function?.name) {
                acc.function.name = tc.function.name;
              }
              if (tc.function?.arguments) {
                acc.function.arguments += tc.function.arguments;
              }

              // 【NEW】Yield intermediate tool_call delta event for real-time UI feedback
              yield JSON.stringify({
                type: 'tool_call_delta',
                index: idx,
                id: acc.id,
                functionName: acc.function.name,
                argumentsLength: acc.function.arguments.length,
              });
            }
          }
        } catch (e) {
          console.error('Failed to parse streaming response chunk:', e);
          console.error('Failed to parse JSON string:', jsonStr);
        }
      }
    }

    // 流结束后，flush thinkParser 中残留的内容（未闭合的 <think> 或尾部片段）
    const trailing = thinkParser.flush();
    for (const piece of trailing) {
      if (piece.type === 'thinking') {
        yield `\x01THINKING\x02${piece.text}`;
      } else {
        contentChunks.push(piece.text);
        yield piece.text;
      }
    }

    // 将 Map 转为有序数组，并为缺失 id 的 tool call 生成兜底 id
    const toolCalls: any[] = [];
    const sortedIndices = Array.from(toolCallMap.keys()).sort((a, b) => a - b);
    for (const idx of sortedIndices) {
      const tc = toolCallMap.get(idx);
      if (tc && tc.function.name) {
        // 兜底：如果 provider 没有返回 id，生成一个
        if (!tc.id) {
          tc.id = `call_${idx}_${Date.now()}`;
          console.warn(`[OpenAIClient] Tool call missing id, generated fallback: ${tc.id}`);
        }
        toolCalls.push(tc);
      }
    }

    if (toolCalls.length > 0) {
      yield JSON.stringify({ type: 'tool_calls', toolCalls });
    } else if (contentChunks.length > 0) {
      // 兜底：某些模型（尤其 qwen-flash 小模型）会把工具调用以文本形式塞在 content 里，
      // 而不是通过 delta.tool_calls 流式返回。这里扫描内容尝试提取。
      const fullContent = contentChunks.join('');
      const rescued = rescueToolCallsFromContent(fullContent);
      if (rescued.length > 0) {
        console.warn(`[OpenAIClient] Rescued ${rescued.length} tool call(s) from content (model did not use delta.tool_calls)`);
        yield JSON.stringify({ type: 'tool_calls', toolCalls: rescued });
        return;
      }
    }

    // 调试：记录流结束时的状态
    console.log('[OpenAIClient] Stream ended - content chunks:', contentChunks.length, 'tool calls:', toolCalls.length);
  }
}

/**
 * 从文本内容中抢救式提取 tool_call
 * 支持的格式：
 *   1. <tool_call>{"name":"x","arguments":{...}}</tool_call>
 *   2. ```tool_call\n{...}\n``` 或 ```json\n{"name":...}\n```
 *   3. 纯 JSON：{"name":"x","arguments":{...}}
 */
function rescueToolCallsFromContent(content: string): any[] {
  const results: any[] = [];
  const seen = new Set<string>();

  const tryAdd = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    // 兼容两种结构：{name, arguments} 或 {function: {name, arguments}}
    let name: string | undefined;
    let args: any;
    if (obj.function?.name) {
      name = obj.function.name;
      args = obj.function.arguments;
    } else if (obj.name) {
      name = obj.name;
      args = obj.arguments;
    }
    if (!name || typeof name !== 'string') return;
    if (args && typeof args === 'object') args = JSON.stringify(args);
    if (args === undefined) args = '{}';
    const key = `${name}:${args}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push({
      id: `call_rescued_${results.length}_${Date.now()}`,
      type: 'function',
      function: { name, arguments: args },
    });
  };

  // 1. <tool_call>...</tool_call>
  const xmlRe = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let m: RegExpExecArray | null;
  while ((m = xmlRe.exec(content)) !== null) {
    try { tryAdd(JSON.parse(m[1])); } catch {}
  }

  // 2. ```tool_call ... ``` 或 ```tool_use ... ```
  const fenceRe = /```(?:tool_call|tool_use|json)?\s*\n?([\s\S]*?)\n?```/g;
  while ((m = fenceRe.exec(content)) !== null) {
    const body = m[1].trim();
    try { tryAdd(JSON.parse(body)); } catch {}
  }

  // 3. 兜底：扫描裸 JSON（仅当上面没匹配到时）
  if (results.length === 0) {
    const jsonRe = /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[^}]*\})\s*\}/g;
    while ((m = jsonRe.exec(content)) !== null) {
      try {
        tryAdd({ name: m[1], arguments: JSON.parse(m[2]) });
      } catch {}
    }
  }

  return results;
}
