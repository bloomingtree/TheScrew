import { ipcMain } from 'electron';
import Store from 'electron-store';
import { getAppConfigStore, ModelConfig, ModelConfigs, AppSettings, ModelCapabilities, ThinkingMode } from '../config/AppConfigStore';
import { detectCapabilities } from '../utils/capabilityDetector';

export function registerConfigHandlers(store: Store) {
  const appConfigStore = getAppConfigStore();

  // ========== 旧配置接口（兼容） ==========

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

  // ========== 新模型配置接口 ==========

  /**
   * 获取所有模型配置
   */
  ipcMain.handle('modelConfig:getAll', (): ModelConfigs => {
    return appConfigStore.getModelConfigs();
  });

  /**
   * 获取激活的配置
   */
  ipcMain.handle('modelConfig:getActive', (): ModelConfig | null => {
    return appConfigStore.getActiveConfig();
  });

  /**
   * 添加模型配置
   */
  ipcMain.handle('modelConfig:add', (_event, config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): ModelConfig => {
    return appConfigStore.addModelConfig(config);
  });

  /**
   * 更新模型配置
   */
  ipcMain.handle('modelConfig:update', (_event, id: string, config: Partial<ModelConfig>): ModelConfig | null => {
    return appConfigStore.updateModelConfig(id, config);
  });

  /**
   * 删除模型配置
   */
  ipcMain.handle('modelConfig:delete', (_event, id: string): { success: boolean } => {
    const success = appConfigStore.deleteModelConfig(id);
    return { success };
  });

  /**
   * 设置激活的配置
   */
  ipcMain.handle('modelConfig:setActive', (_event, id: string): ModelConfig | null => {
    return appConfigStore.setActiveConfig(id);
  });

  /**
   * 复制模型配置
   */
  ipcMain.handle('modelConfig:duplicate', (_event, id: string): ModelConfig | null => {
    return appConfigStore.duplicateModelConfig(id);
  });

  /**
   * 导入配置
   */
  ipcMain.handle('modelConfig:import', (_event, configs: ModelConfig[]): ModelConfig[] => {
    return appConfigStore.importConfigs(configs);
  });

  /**
   * 导出配置
   */
  ipcMain.handle('modelConfig:export', (): ModelConfig[] => {
    return appConfigStore.exportConfigs();
  });

  /**
   * 从 localStorage 迁移数据
   */
  ipcMain.handle('modelConfig:migrateFromLocalStorage', (_event, data: string): { success: boolean } => {
    const success = appConfigStore.migrateFromLocalStorage(data);
    return { success };
  });

  /**
   * 同步保存完整配置（用于前端同步）
   */
  ipcMain.handle('modelConfig:sync', (_event, modelConfigs: ModelConfigs): { success: boolean } => {
    try {
      console.log('[ConfigIPC] modelConfig:sync called with', modelConfigs?.configs?.length, 'configs');
      console.log('[ConfigIPC] Active config ID:', modelConfigs?.activeConfigId);
      if (modelConfigs?.configs?.[0]) {
        console.log('[ConfigIPC] First config:', JSON.stringify({
          id: modelConfigs.configs[0].id,
          name: modelConfigs.configs[0].name,
          model: modelConfigs.configs[0].model,
          hasApiKey: !!modelConfigs.configs[0].apiKey
        }));
      }
      appConfigStore.saveModelConfigsSync(modelConfigs);
      console.log('[ConfigIPC] Model configs saved successfully');
      return { success: true };
    } catch (e: any) {
      console.error('[ConfigIPC] Failed to sync model configs:', e);
      return { success: false };
    }
  });

  // ========== 应用设置接口 ==========

  /**
   * 获取应用设置
   */
  ipcMain.handle('appSettings:get', (): AppSettings => {
    return appConfigStore.getSettings();
  });

  /**
   * 保存应用设置
   */
  ipcMain.handle('appSettings:save', (_event, settings: AppSettings): { success: boolean } => {
    try {
      appConfigStore.saveSettings(settings);
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  });

  /**
   * 获取思考模式
   */
  ipcMain.handle('appSettings:getThinkingMode', (): ThinkingMode => {
    return appConfigStore.getThinkingMode();
  });

  /**
   * 设置思考模式
   */
  ipcMain.handle('appSettings:setThinkingMode', (_event, mode: ThinkingMode): { success: boolean } => {
    try {
      appConfigStore.setThinkingMode(mode);
      return { success: true };
    } catch (e) {
      return { success: false };
    }
  });

  // ========== 模型能力检测接口 ==========

  /**
   * 根据模型名称检测能力
   */
  ipcMain.handle('modelConfig:detectCapabilities', (_event, modelName: string): ModelCapabilities => {
    return detectCapabilities(modelName);
  });

  /**
   * 更新模型能力配置
   */
  ipcMain.handle('modelConfig:updateCapabilities', (_event, id: string, capabilities: ModelCapabilities): { success: boolean; config?: ModelConfig } => {
    try {
      const config = appConfigStore.updateModelConfig(id, { capabilities });
      return { success: true, config: config || undefined };
    } catch (e) {
      return { success: false };
    }
  });
}
