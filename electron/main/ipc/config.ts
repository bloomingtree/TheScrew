import { ipcMain } from 'electron';
import Store from 'electron-store';

export function registerConfigHandlers(store: Store) {
  ipcMain.handle('config:get', () => {
    return store.get('config', {
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 32768,
    });
  });

  ipcMain.handle('config:set', (_event, config: any) => {
    store.set('config', config);
    return { success: true };
  });

  ipcMain.handle('config:validate', async (_event, config: any) => {
    try {
      if (!config.apiKey) {
        return { valid: false, error: 'API Key 不能为空' };
      }

      if (!config.baseUrl) {
        return { valid: false, error: 'API 地址不能为空' };
      }

      const { OpenAIClient } = await import('../api/openai');
      const client = new OpenAIClient(
        config.baseUrl,
        config.apiKey,
        config.model,
        config.temperature,
        config.maxTokens
      );

      const result = await client.validate();

      if (result.valid) {
        store.set('config', config);
      }

      return result;
    } catch (error: any) {
      return { valid: false, error: error.message };
    }
  });
}
