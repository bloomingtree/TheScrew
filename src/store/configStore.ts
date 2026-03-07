import { create } from 'zustand';
import { Config, ModelConfig, ModelConfigs } from '../types';

interface ConfigState extends Config {
  isConfigOpen: boolean;
  // 多配置支持
  modelConfigs: ModelConfigs;

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

// 保存到 localStorage
const saveModelConfigs = (modelConfigs: ModelConfigs) => {
  try {
    localStorage.setItem('modelConfigs', JSON.stringify(modelConfigs));
  } catch (e) {
    console.error('Failed to save model configs:', e);
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
  };
});
