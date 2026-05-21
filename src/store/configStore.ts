import { create } from 'zustand';
import { Config, ModelConfig, ModelConfigs } from '../types';

// 思考模式类型
type ThinkingMode = 'auto' | 'enabled' | 'disabled';

// 应用设置接口
interface AppSettings {
  thinkingMode?: ThinkingMode;
  /** @deprecated */
  enableThinking?: boolean;
  [key: string]: any;
}

interface ConfigState extends Config {
  isConfigOpen: boolean;
  // 多配置支持
  modelConfigs: ModelConfigs;
  // 应用设置
  appSettings: AppSettings;

  // 单配置操作（兼容旧代码）
  setConfig: (config: Partial<Config>) => void;
  setConfigOpen: (isOpen: boolean) => void;
  resetConfig: () => void;

  // 多配置操作
  addModelConfig: (config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateModelConfig: (id: string, config: Partial<ModelConfig>) => void;
  deleteModelConfig: (id: string) => void;
  setActiveConfig: (id: string) => void;
  duplicateModelConfig: (id: string) => string | null;
  importConfigs: (configs: ModelConfig[]) => void;
  exportConfigs: () => ModelConfig[];
  getActiveConfig: () => ModelConfig | null;

  // 应用设置操作
  loadAppSettings: () => Promise<void>;
  setThinkingMode: (mode: ThinkingMode) => void;
  setHardwareAcceleration: (enabled: boolean) => void;
  getThinkingMode: () => ThinkingMode;

  // 手动同步到后端
  syncToBackendNow: () => Promise<boolean>;

  // 从后端加载配置
  loadFromBackend: () => Promise<void>;
}

const defaultConfig: Config = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 32768,
};

// 生成唯一 ID
const generateId = () => `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 从 localStorage 加载配置
const loadModelConfigs = (): ModelConfigs => {
  try {
    const stored = localStorage.getItem('modelConfigs');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.configs && parsed.configs.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Failed to load model configs:', e);
  }

  // 默认配置
  const defaultModelConfig: ModelConfig = {
    id: generateId(),
    name: '默认配置',
    ...defaultConfig,
    isDefault: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  return {
    configs: [defaultModelConfig],
    activeConfigId: defaultModelConfig.id,
  };
};

// 保存到 localStorage（同步）
const saveModelConfigs = (modelConfigs: ModelConfigs) => {
  try {
    localStorage.setItem('modelConfigs', JSON.stringify(modelConfigs));
  } catch (e) {
    console.error('Failed to save model configs to localStorage:', e);
  }
};

// 同步到后端文件（异步）
const syncToBackend = async (modelConfigs: ModelConfigs) => {
  try {
    if ((window as any).electronAPI?.config?.modelConfig?.sync) {
      console.log('[ConfigStore] Syncing model configs to backend...', {
        configsCount: modelConfigs?.configs?.length,
        activeId: modelConfigs?.activeConfigId,
        firstConfig: modelConfigs?.configs?.[0] ? {
          name: modelConfigs.configs[0].name,
          model: modelConfigs.configs[0].model,
          hasApiKey: !!modelConfigs.configs[0].apiKey
        } : null
      });
      const result = await (window as any).electronAPI.config.modelConfig.sync(modelConfigs);
      console.log('[ConfigStore] Sync result:', result);
    } else {
      console.warn('[ConfigStore] electronAPI.config.modelConfig.sync not available');
    }
  } catch (e) {
    console.error('Failed to sync model configs to backend:', e);
  }
};

export const useConfigStore = create<ConfigState>((set, get) => {
  const initialModelConfigs = loadModelConfigs();
  const activeConfig = initialModelConfigs.configs.find(
    c => c.id === initialModelConfigs.activeConfigId
  ) || initialModelConfigs.configs[0];

  return {
    // 当前激活的配置（兼容旧代码）
    ...defaultConfig,
    ...(activeConfig ? {
      apiKey: activeConfig.apiKey,
      baseUrl: activeConfig.baseUrl,
      model: activeConfig.model,
      temperature: activeConfig.temperature,
      maxTokens: activeConfig.maxTokens,
    } : {}),

    isConfigOpen: false,
    modelConfigs: initialModelConfigs,
    appSettings: { thinkingMode: 'auto' },

    // 单配置操作（兼容旧代码）
    setConfig: (config) => set((state) => ({ ...state, ...config })),

    setConfigOpen: (isOpen) => set({ isConfigOpen: isOpen }),

    resetConfig: () => set(defaultConfig),

    // 多配置操作
    addModelConfig: (config) => {
      const id = generateId();
      const now = Date.now();
      const newConfig: ModelConfig = {
        ...config,
        id,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const newModelConfigs = {
          ...state.modelConfigs,
          configs: [...state.modelConfigs.configs, newConfig],
        };
        saveModelConfigs(newModelConfigs);
        // 异步同步到后端（不阻塞 UI）
        syncToBackend(newModelConfigs);
        return { modelConfigs: newModelConfigs };
      });

      return id;
    },

    updateModelConfig: (id, config) => {
      set((state) => {
        const newConfigs = state.modelConfigs.configs.map(c =>
          c.id === id ? { ...c, ...config, updatedAt: Date.now() } : c
        );
        const newModelConfigs = { ...state.modelConfigs, configs: newConfigs };
        saveModelConfigs(newModelConfigs);
        // 异步同步到后端（不阻塞 UI）
        syncToBackend(newModelConfigs);

        // 如果更新的是当前激活的配置，同步更新顶层配置
        if (id === state.modelConfigs.activeConfigId) {
          const updatedConfig = newConfigs.find(c => c.id === id);
          if (updatedConfig) {
            return {
              modelConfigs: newModelConfigs,
              apiKey: updatedConfig.apiKey,
              baseUrl: updatedConfig.baseUrl,
              model: updatedConfig.model,
              temperature: updatedConfig.temperature,
              maxTokens: updatedConfig.maxTokens,
            };
          }
        }

        return { modelConfigs: newModelConfigs };
      });
    },

    deleteModelConfig: (id) => {
      set((state) => {
        // 不能删除最后一个配置
        if (state.modelConfigs.configs.length <= 1) {
          return state;
        }

        const newConfigs = state.modelConfigs.configs.filter(c => c.id !== id);
        let newActiveId = state.modelConfigs.activeConfigId;

        // 如果删除的是当前激活的配置，切换到第一个
        if (id === state.modelConfigs.activeConfigId && newConfigs.length > 0) {
          newActiveId = newConfigs[0].id;
        }

        const newModelConfigs = {
          configs: newConfigs,
          activeConfigId: newActiveId,
        };
        saveModelConfigs(newModelConfigs);
        // 异步同步到后端（不阻塞 UI）
        syncToBackend(newModelConfigs);

        // 同步更新顶层配置
        const activeConfig = newConfigs.find(c => c.id === newActiveId);
        if (activeConfig) {
          return {
            modelConfigs: newModelConfigs,
            apiKey: activeConfig.apiKey,
            baseUrl: activeConfig.baseUrl,
            model: activeConfig.model,
            temperature: activeConfig.temperature,
            maxTokens: activeConfig.maxTokens,
          };
        }

        return { modelConfigs: newModelConfigs };
      });
    },

    setActiveConfig: (id) => {
      set((state) => {
        const config = state.modelConfigs.configs.find(c => c.id === id);
        if (!config) return state;

        const newModelConfigs = {
          ...state.modelConfigs,
          activeConfigId: id,
        };
        saveModelConfigs(newModelConfigs);
        // 异步同步到后端（不阻塞 UI）
        syncToBackend(newModelConfigs);

        return {
          modelConfigs: newModelConfigs,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
          temperature: config.temperature,
          maxTokens: config.maxTokens,
        };
      });
    },

    duplicateModelConfig: (id) => {
      const state = get();
      const config = state.modelConfigs.configs.find(c => c.id === id);
      if (!config) return null;

      const newId = generateId();
      const now = Date.now();
      const newConfig: ModelConfig = {
        ...config,
        id: newId,
        name: `${config.name} (副本)`,
        isDefault: false,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => {
        const newModelConfigs = {
          ...state.modelConfigs,
          configs: [...state.modelConfigs.configs, newConfig],
        };
        saveModelConfigs(newModelConfigs);
        // 异步同步到后端（不阻塞 UI）
        syncToBackend(newModelConfigs);
        return { modelConfigs: newModelConfigs };
      });

      return newId;
    },

    importConfigs: (configs) => {
      set((state) => {
        const now = Date.now();
        const newConfigs = configs.map((c, index) => ({
          ...c,
          id: c.id || generateId(),
          name: c.name || `导入配置 ${index + 1}`,
          createdAt: c.createdAt || now,
          updatedAt: now,
        }));

        const mergedConfigs = [...state.modelConfigs.configs, ...newConfigs];
        const newModelConfigs = {
          ...state.modelConfigs,
          configs: mergedConfigs,
        };
        saveModelConfigs(newModelConfigs);
        // 异步同步到后端（不阻塞 UI）
        syncToBackend(newModelConfigs);

        return { modelConfigs: newModelConfigs };
      });
    },

    exportConfigs: () => {
      return get().modelConfigs.configs;
    },

    getActiveConfig: () => {
      const state = get();
      return state.modelConfigs.configs.find(
        c => c.id === state.modelConfigs.activeConfigId
      ) || null;
    },

    // 应用设置操作
    loadAppSettings: async () => {
      try {
        const settings = await (window as any).electronAPI.config.appSettings.get();
        // 兼容旧的 enableThinking 布尔值
        if (settings.thinkingMode === undefined && settings.enableThinking !== undefined) {
          settings.thinkingMode = settings.enableThinking ? 'enabled' : 'disabled';
        }
        set({ appSettings: { thinkingMode: 'auto', ...settings } });
      } catch (e) {
        console.error('Failed to load app settings:', e);
      }
    },

    setThinkingMode: (mode: ThinkingMode) => {
      set((state) => {
        const newSettings = { ...state.appSettings, thinkingMode: mode };
        // 异步保存到后端
        (window as any).electronAPI?.config?.appSettings?.setThinkingMode?.(mode);
        return { appSettings: newSettings };
      });
    },

    setHardwareAcceleration: (enabled: boolean) => {
      set((state) => {
        const newSettings = { ...state.appSettings, hardwareAcceleration: enabled };
        (window as any).electronAPI?.config?.appSettings?.save?.(newSettings);
        return { appSettings: newSettings };
      });
    },

    getThinkingMode: () => {
      return get().appSettings.thinkingMode ?? 'auto';
    },

    // 手动同步到后端
    syncToBackendNow: async () => {
      const state = get();
      console.log('[ConfigStore] Manual sync triggered');
      await syncToBackend(state.modelConfigs);
      return true;
    },

    // 从后端加载配置
    loadFromBackend: async () => {
      try {
        console.log('[ConfigStore] Loading model configs from backend...');
        const backendConfigs = await (window as any).electronAPI?.config?.modelConfig?.getAll?.();

        // 检查后端是否有真正有效的配置（有 API Key）
        const hasValidBackendConfig = backendConfigs?.configs?.some((c: ModelConfig) => c.apiKey && c.apiKey.length > 0);

        if (hasValidBackendConfig) {
          // 后端有有效配置，使用后端数据
          console.log('[ConfigStore] Backend has valid config with API key, using backend data');
          const activeConfig = backendConfigs.configs.find(
            (c: ModelConfig) => c.id === backendConfigs.activeConfigId
          ) || backendConfigs.configs[0];

          set({
            modelConfigs: backendConfigs,
            ...(activeConfig ? {
              apiKey: activeConfig.apiKey,
              baseUrl: activeConfig.baseUrl,
              model: activeConfig.model,
              temperature: activeConfig.temperature,
              maxTokens: activeConfig.maxTokens,
            } : {}),
          });

          // 同时更新 localStorage
          localStorage.setItem('modelConfigs', JSON.stringify(backendConfigs));
        } else {
          // 后端没有有效配置，检查 localStorage 是否有有效配置
          const state = get();
          const hasValidLocalConfig = state.modelConfigs.configs.some(c => c.apiKey && c.apiKey.length > 0);

          if (hasValidLocalConfig) {
            // localStorage 有有效配置，同步到后端
            console.log('[ConfigStore] Backend has no valid config, syncing localStorage to backend');
            await syncToBackend(state.modelConfigs);
          } else {
            console.log('[ConfigStore] Neither backend nor localStorage has valid config');
          }
        }
      } catch (e) {
        console.error('[ConfigStore] Failed to load from backend:', e);
      }
    },
  };
});
