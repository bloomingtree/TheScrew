import axios from 'axios';
import { ThinkingMode } from '../config/AppConfigStore';

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
 */
function sanitizeMessages(messages: any[]): any[] {
  return messages.map(msg => {
    const role = msg.role;

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
    let buffer = '';
    let contentChunks: string[] = [];

    for await (const chunk of stream) {
      const chunkStr = chunk.toString();
      buffer += chunkStr;

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

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

          const delta = parsed.choices?.[0]?.delta;
          const content = delta?.content;
          const reasoningContent = delta?.reasoning_content;
          const newToolCalls = delta?.tool_calls;

          // 处理思考内容（千问/QwQ/DeepSeek 等模型的 reasoning_content）
          if (reasoningContent) {
            yield `\x01THINKING\x02${reasoningContent}`;
          }

          if (content) {
            contentChunks.push(content);
            yield content;
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
            }
          }
        } catch (e) {
          console.error('Failed to parse streaming response chunk:', e);
          console.error('Failed to parse JSON string:', jsonStr);
        }
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
    }

    // 调试：记录流结束时的状态
    console.log('[OpenAIClient] Stream ended - content chunks:', contentChunks.length, 'tool calls:', toolCalls.length);
  }
}
