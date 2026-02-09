import axios from 'axios';

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
        console.error('[Axios Response Error] Status:', status || 'No status');
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
    // 粗略估算请求体大小
    const messagesStr = JSON.stringify(messages);
    const toolsStr = tools ? JSON.stringify(tools) : '';
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

    console.log('[DEBUG] Sending request - model:', this.model, 'messages:', messages.length, 'tools:', tools?.length || 0);
    console.log('========== Request Body ==========');
    console.log(JSON.stringify(requestBody, null, 2));
    console.log('==================================');

    const response = await this.axiosInstance.post(`${this.baseUrl}/chat/completions`, requestBody, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      responseType: 'stream',
      signal,
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
          const newToolCalls = delta?.tool_calls;

          if (content) {
            contentChunks.push(content);
            yield content;
          }

          if (newToolCalls) {
            for (const toolCall of newToolCalls) {
              if (toolCall.index !== undefined) {
                if (!currentToolCall || currentToolCall.index !== toolCall.index) {
                  if (currentToolCall && currentToolCall.function && currentToolCall.function.arguments) {
                    toolCalls.push(currentToolCall);
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
      toolCalls.push(currentToolCall);
    }

    console.log('========== AI Response ==========');
    console.log(contentChunks.join(''));
    console.log('==================================');

    if (toolCalls.length > 0) {
      yield JSON.stringify({ type: 'tool_calls', toolCalls });
    }
  }
}
