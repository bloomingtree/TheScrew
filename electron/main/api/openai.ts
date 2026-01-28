import axios from 'axios';

export class OpenAIClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private model: string,
    private temperature: number,
    private maxTokens: number
  ) {}

  async validate(): Promise<{ valid: boolean; error?: string }> {
    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
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

  async *streamChat(messages: any[], signal?: AbortSignal): AsyncGenerator<string> {
    const response = await axios.post(`${this.baseUrl}/chat/completions`, {
      model: this.model,
      messages,
      stream: true,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      responseType: 'stream',
      signal,
    });

    const stream = response.data;

    for await (const chunk of stream) {
      const data = chunk.toString();
      const lines = data.split('\n');

      for (const line of lines) {
        const trimmed = line.trim();
        
        if (trimmed === '') continue;
        if (trimmed === 'data: [DONE]') return;
        if (!trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;

          if (content) {
            yield content;
          }
        } catch (e) {
          console.error('Failed to parse streaming response chunk:', e);
        }
      }
    }
  }
}
