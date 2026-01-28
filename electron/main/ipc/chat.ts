import { ipcMain } from 'electron';
import { OpenAIClient } from '../api/openai';
import Store from 'electron-store';

let currentClient: OpenAIClient | null = null;
let currentAbortController: AbortController | null = null;

export function registerChatHandlers(store: Store) {
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

      for await (const chunk of client.streamChat(messages, currentAbortController.signal)) {
        chunks.push(chunk);
        event.sender.send('chat:chunk', chunk);
      }

      currentClient = null;
      currentAbortController = null;

      return { success: true, content: chunks.join('') };
    } catch (error: any) {
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
