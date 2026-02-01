import { ipcMain } from 'electron';
import { OpenAIClient } from '../api/openai';
import Store from 'electron-store';
import { toolManager } from '../tools/ToolManager';
import { fileTools } from '../tools/FileTools';
import { wordTools } from '../tools/WordTools';

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
  fileTools.forEach(tool => {
    toolManager.registerTool(tool);
  });

  wordTools.forEach(tool => {
    toolManager.registerTool(tool);
  });

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

  ipcMain.handle('chat:stream', async (event, messages: any[]) => {
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
      const tools = toolManager.getOpenAIFunctionDefinitions();

      while (true) {
        let hasToolCalls = false;

        messages = trimMessages(messages, 10);

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

                const results = await toolManager.executeToolCalls(parsed.toolCalls);
                
                for (let i = 0; i < results.length; i++) {
                  const result = results[i];
                  const endTime = Date.now();
                  const startTime = startTimes.get(result.toolCallId) || endTime;
                  const duration = endTime - startTime;
                  
                  event.sender.send('chat:tool_complete', {
                    toolCallId: result.toolCallId,
                    duration,
                    success: result.success,
                    timestamp: endTime,
                  });
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
        
        if (!hasToolCalls) {
          break;
        }
      }

      currentClient = null;
      currentAbortController = null;

      return { success: true, content: chunks.join('') };
    } catch (error: any) {
      console.error('\n========== Chat Stream Error ==========');
      console.error('Error:', error.message);
      console.error('Error stack:', error.stack);
      currentClient = null;
      currentAbortController = null;
      return { success: false, error: error.message };
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
