import axios from 'axios';

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

  async *streamChat(messages: any[], signal?: AbortSignal, tools?: any[]): AsyncGenerator<string> {
    // 粗略估算请求体大小（使用 safeStringify 防止循环引用崩溃）
    const messagesStr = safeStringify(messages);
    const toolsStr = tools ? safeStringify(tools) : '';
    const estimatedSize = messagesStr.length + toolsStr.length;

    // 警告：请求体过大
    const SIZE_WARNING_THRESHOLD = 50000; // 50KB
    if (estimatedSize > SIZE_WARNING_THRESHOLD) {
      console.warn(`[OpenAIClient] Request body is large: ~${(estimatedSize / 1024).toFixed(2)} KB`);
      console.warn(`[OpenAIClient] This may exceed the model's context window and cause 400 errors`);
    }

    const requestBody: any = {
      model: this.model,
      messages,
      stream: true,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
    }

    console.log('[OpenAIClient] Sending request - model:', this.model, 'messages:', messages.length, 'tools:', tools?.length || 0);

    const response = await this.axiosInstance.post(`${this.baseUrl}/chat/completions`, requestBody, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        // 禁止压缩，避免某些 API 的兼容性问题
        'Accept-Encoding': 'gzip, deflate, identity',
      },
      responseType: 'stream',
      signal,
      // 禁用 axios 的自动解压，避免某些情况下的问题
      decompress: true,
      maxRedirects: 0,
    });

    const stream = response.data;
    let toolCalls: any[] = [];
    let currentToolCall: any = null;
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

          // 处理思考内容（千问/QwQ 等模型的 reasoning_content）
          if (reasoningContent) {
            yield reasoningContent;
          }

          if (content) {
            contentChunks.push(content);
            yield content;
          }

          if (newToolCalls) {
            for (const toolCall of newToolCalls) {
              if (toolCall.index !== undefined) {
                if (!currentToolCall || currentToolCall.index !== toolCall.index) {
                  if (currentToolCall && currentToolCall.function && currentToolCall.function.arguments) {
                    // 清理流式传输中的临时字段（index），只保留 API 规范字段
                    const { index: _, ...cleanCall } = currentToolCall;
                    toolCalls.push(cleanCall);
                  }
                  currentToolCall = { ...toolCall, index: toolCall.index, function: { name: '', arguments: '' } };
                }

                if (toolCall.function?.name) {
                  currentToolCall.function.name = toolCall.function.name;
                }

                if (toolCall.function?.arguments) {
                  currentToolCall.function.arguments += toolCall.function.arguments;
                }
              }
            }
          }
        } catch (e) {
          console.error('Failed to parse streaming response chunk:', e);
          console.error('Failed to parse JSON string:', jsonStr);
        }
      }
    }
    
    if (currentToolCall && currentToolCall.function && currentToolCall.function.arguments) {
      // 清理流式传输中的临时字段（index），只保留 API 规范字段
      const { index, ...cleanToolCall } = currentToolCall;
      toolCalls.push(cleanToolCall);
    }

    if (toolCalls.length > 0) {
      yield JSON.stringify({ type: 'tool_calls', toolCalls });
    }

    // 调试：记录流结束时的状态
    console.log('[OpenAIClient] Stream ended - content chunks:', contentChunks.length, 'tool calls:', toolCalls.length);
  }
}
