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

  private safeStringify(obj: any, indent: number | string = 2): string {
    try {
      return JSON.stringify(obj, null, indent);
    } catch (e) {
      const cache = new Set();
      return JSON.stringify(
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
    }
  }

  private setupInterceptors() {
    this.axiosInstance.interceptors.request.use(
      (config: any) => {
        return config;
      },
      (error: any) => {
        console.error('\n========== Axios Request Error ==========');
        console.error('Error:', error.message);
        console.error('========================================\n');
        return Promise.reject(error);
      }
    );

    this.axiosInstance.interceptors.response.use(
      (response: any) => {
        return response;
      },
      (error: any) => {
        console.error('\n========== Axios Response Error ==========');
        console.error('URL:', error.config?.url || 'Unknown');
        console.error('Status:', error.response?.status || 'No status');
        console.error('Error:', error.message);
        if (error.response?.data) {
          console.error('Response Data:', this.safeStringify(error.response.data, 2));
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

  async *streamChat(messages: any[], signal?: AbortSignal, tools?: any[]): AsyncGenerator<string> {
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
