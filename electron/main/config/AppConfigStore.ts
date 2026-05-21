/**
 * 应用配置存储服务
 * 存储模型配置、API 配置等信息
 */

import Store from 'electron-store';
import { getPathManager } from './PathManager';

/**
 * 模型能力
 */
export interface ModelCapabilities {
  vision: boolean;
  toolUse: boolean;
  streaming: boolean;
}

/**
 * 模型配置接口
 */
export interface ModelConfig {
  id: string;
  name: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  isDefault?: boolean;
  capabilities?: ModelCapabilities;
  createdAt?: number;
  updatedAt?: number;
}

/**
 * 多模型配置集合
 */
export interface ModelConfigs {
  configs: ModelConfig[];
  activeConfigId: string;
}

/**
 * 思考模式类型
 * - auto: 不干预，使用服务器默认设置
 * - enabled: 强制开启思考（发送 chat_template_kwargs: { enable_thinking: true }）
 * - disabled: 强制关闭思考（发送 chat_template_kwargs: { enable_thinking: false }）
 */
export type ThinkingMode = 'auto' | 'enabled' | 'disabled';

/**
 * 应用设置接口（思考模式等）
 */
export interface AppSettings {
  thinkingMode?: ThinkingMode;  // 思考模式控制
  hardwareAcceleration?: boolean; // 硬件加速（默认 true），设为 false 可解决虚拟机/远程桌面卡顿
  /** @deprecated 使用 thinkingMode 替代 */
  enableThinking?: boolean;
  [key: string]: any;  // 允许扩展其他设置
}

/**
 * 应用配置数据结构
 */
export interface AppConfig {
  modelConfigs: ModelConfigs;
  settings?: AppSettings;
  version?: number;
}

/**
 * 默认配置
 */
const DEFAULT_CONFIG: Config = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 32768,
};

interface Config {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

/**
 * 生成唯一 ID
 */
const generateId = () => `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

/**
 * 应用配置存储类
 */
export class AppConfigStore {
  private store: Store<AppConfig>;

  constructor() {
    const pathManager = getPathManager();
    const configPath = pathManager.getConfigPath();
    console.log('[AppConfigStore] Initializing with config path:', configPath);
    this.store = new Store<AppConfig>({
      name: 'config',
      cwd: configPath,
    });
    console.log('[AppConfigStore] Store file path:', this.store.path);
  }

  /**
   * 获取模型配置
   */
  getModelConfigs(): ModelConfigs {
    const stored = this.store.get('modelConfigs');
    console.log('[AppConfigStore] getModelConfigs - stored:', stored ? `has ${stored.configs?.length} configs` : 'null/undefined');
    if (stored && stored.configs && stored.configs.length > 0) {
      return stored;
    }

    // 返回默认配置
    console.log('[AppConfigStore] No stored configs, returning default');
    const defaultModelConfig: ModelConfig = {
      id: generateId(),
      name: '默认配置',
      ...DEFAULT_CONFIG,
      isDefault: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    return {
      configs: [defaultModelConfig],
      activeConfigId: defaultModelConfig.id,
    };
  }

  /**
   * 保存模型配置
   */
  saveModelConfigs(modelConfigs: ModelConfigs): void {
    console.log('[AppConfigStore] saveModelConfigs - saving', modelConfigs?.configs?.length, 'configs');
    this.store.set('modelConfigs', modelConfigs);
    console.log('[AppConfigStore] Model configs saved to:', this.store.path);
  }

  /**
   * 获取激活的配置
   */
  getActiveConfig(): ModelConfig | null {
    const modelConfigs = this.getModelConfigs();
    const activeConfig = modelConfigs.configs.find(c => c.id === modelConfigs.activeConfigId) || modelConfigs.configs[0] || null;
    console.log('[AppConfigStore] getActiveConfig - found:', activeConfig ? `${activeConfig.name} (${activeConfig.model})` : 'null');
    return activeConfig;
  }

  /**
   * 添加模型配置
   */
  addModelConfig(config: Omit<ModelConfig, 'id' | 'createdAt' | 'updatedAt'>): ModelConfig {
    const id = generateId();
    const now = Date.now();
    const newConfig: ModelConfig = {
      ...config,
      id,
      createdAt: now,
      updatedAt: now,
    };

    const modelConfigs = this.getModelConfigs();
    modelConfigs.configs.push(newConfig);
    this.saveModelConfigs(modelConfigs);

    return newConfig;
  }

  /**
   * 更新模型配置
   */
  updateModelConfig(id: string, config: Partial<ModelConfig>): ModelConfig | null {
    const modelConfigs = this.getModelConfigs();
    const index = modelConfigs.configs.findIndex(c => c.id === id);

    if (index === -1) return null;

    modelConfigs.configs[index] = {
      ...modelConfigs.configs[index],
      ...config,
      updatedAt: Date.now(),
    };

    this.saveModelConfigs(modelConfigs);
    return modelConfigs.configs[index];
  }

  /**
   * 删除模型配置
   */
  deleteModelConfig(id: string): boolean {
    const modelConfigs = this.getModelConfigs();

    // 不能删除最后一个配置
    if (modelConfigs.configs.length <= 1) {
      return false;
    }

    const index = modelConfigs.configs.findIndex(c => c.id === id);
    if (index === -1) return false;

    modelConfigs.configs.splice(index, 1);

    // 如果删除的是当前激活的配置，切换到第一个
    if (id === modelConfigs.activeConfigId && modelConfigs.configs.length > 0) {
      modelConfigs.activeConfigId = modelConfigs.configs[0].id;
    }

    this.saveModelConfigs(modelConfigs);
    return true;
  }

  /**
   * 设置激活的配置
   */
  setActiveConfig(id: string): ModelConfig | null {
    const modelConfigs = this.getModelConfigs();
    const config = modelConfigs.configs.find(c => c.id === id);

    if (!config) return null;

    modelConfigs.activeConfigId = id;
    this.saveModelConfigs(modelConfigs);

    return config;
  }

  /**
   * 复制模型配置
   */
  duplicateModelConfig(id: string): ModelConfig | null {
    const modelConfigs = this.getModelConfigs();
    const config = modelConfigs.configs.find(c => c.id === id);

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

    modelConfigs.configs.push(newConfig);
    this.saveModelConfigs(modelConfigs);

    return newConfig;
  }

  /**
   * 导入配置
   */
  importConfigs(configs: ModelConfig[]): ModelConfig[] {
    const modelConfigs = this.getModelConfigs();
    const now = Date.now();

    const newConfigs = configs.map((c, index) => ({
      ...c,
      id: c.id || generateId(),
      name: c.name || `导入配置 ${index + 1}`,
      createdAt: c.createdAt || now,
      updatedAt: now,
    }));

    modelConfigs.configs.push(...newConfigs);
    this.saveModelConfigs(modelConfigs);

    return newConfigs;
  }

  /**
   * 导出配置
   */
  exportConfigs(): ModelConfig[] {
    return this.getModelConfigs().configs;
  }

  /**
   * 从 localStorage 数据迁移
   * 用于首次启动时迁移旧数据
   */
  migrateFromLocalStorage(data: string): boolean {
    try {
      const parsed = JSON.parse(data);
      if (parsed && parsed.configs && parsed.configs.length > 0) {
        this.store.set('modelConfigs', parsed);
        return true;
      }
    } catch (e) {
      console.error('Failed to migrate from localStorage:', e);
    }
    return false;
  }

  /**
   * 同步保存完整配置（用于前端同步）
   */
  saveModelConfigsSync(modelConfigs: ModelConfigs): void {
    this.saveModelConfigs(modelConfigs);
  }

  // ==================== 应用设置 ====================

  /**
   * 获取应用设置
   * 兼容旧的 enableThinking 布尔值，自动迁移为 thinkingMode
   */
  getSettings(): AppSettings {
    const stored = this.store.get('settings');
    if (stored) {
      // 兼容迁移：enableThinking → thinkingMode
      if (stored.thinkingMode === undefined && stored.enableThinking !== undefined) {
        stored.thinkingMode = stored.enableThinking ? 'enabled' : 'disabled';
        delete stored.enableThinking;
        this.store.set('settings', stored);
      }
      return stored;
    }
    // 返回默认设置
    return {
      thinkingMode: 'auto',
    };
  }

  /**
   * 保存应用设置
   */
  saveSettings(settings: AppSettings): void {
    this.store.set('settings', settings);
  }

  /**
   * 更新单个设置项
   */
  updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    const settings = this.getSettings();
    settings[key] = value;
    this.saveSettings(settings);
  }

  /**
   * 获取思考模式
   */
  getThinkingMode(): ThinkingMode {
    return this.getSettings().thinkingMode ?? 'auto';
  }

  /**
   * 设置思考模式
   */
  setThinkingMode(mode: ThinkingMode): void {
    this.updateSetting('thinkingMode', mode);
  }
}

// 单例
let appConfigStoreInstance: AppConfigStore | null = null;

/**
 * 获取 AppConfigStore 单例
 */
export function getAppConfigStore(): AppConfigStore {
  if (!appConfigStoreInstance) {
    appConfigStoreInstance = new AppConfigStore();
  }
  return appConfigStoreInstance;
}
