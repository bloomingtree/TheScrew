/**
 * 凭证存储服务
 * 使用加密方式存储 API Keys 等敏感信息
 * 参考 OpenClaw 的 credentials/ 目录设计
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import Store from 'electron-store';
import { getPathManager } from './PathManager';

/**
 * 加密配置
 */
const ENCRYPTION_CONFIG = {
  algorithm: 'aes-256-gcm',
  keyLength: 32,
  ivLength: 16,
  saltLength: 64,
  tagLength: 16,
} as const;

/**
 * 加密数据结构
 */
interface EncryptedData {
  /** 加密算法 */
  algorithm: string;
  /** 盐值 */
  salt: string;
  /** 初始化向量 */
  iv: string;
  /** 认证标签 */
  tag: string;
  /** 加密后的数据 */
  data: string;
}

/**
 * 凭证存储结构
 */
interface CredentialData {
  apiKeys: Record<string, any>; // any 类型用于存储 EncryptedData
  otherCredentials: Record<string, any>;
}

/**
 * 凭证存储类
 */
export class CredentialStore {
  private credentialsPath: string;
  private masterKey: Buffer;
  private store: Store<CredentialData>;

  constructor() {
    // 凭证存储路径: 使用 PathManager 获取
    this.credentialsPath = getPathManager().getCredentialsPath();
    this.masterKey = this.getOrCreateMasterKey();
    this.store = new Store<CredentialData>({
      name: 'api-keys',
      cwd: this.credentialsPath,
      encryptionKey: 'api-key-encryption-key-v1', // electron-store 额外加密层
    });
  }

  /**
   * 获取或创建主密钥
   * 使用机器特定信息生成，避免明文存储
   */
  private getOrCreateMasterKey(): Buffer {
    const keyPath = path.join(this.credentialsPath, '.master-key');

    try {
      // 尝试读取现有密钥
      const existingKey = require('fs').readFileSync(keyPath);
      return Buffer.from(existingKey, 'hex');
    } catch {
      // 生成新密钥
      const key = crypto.randomBytes(ENCRYPTION_CONFIG.keyLength);
      this.ensureCredentialsDir().then(() => {
        require('fs').writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
      }).catch(console.error);
      return key;
    }
  }

  /**
   * 确保凭证目录存在
   */
  private async ensureCredentialsDir(): Promise<void> {
    try {
      await fs.mkdir(this.credentialsPath, { recursive: true });
    } catch (err) {
      console.error('Failed to create credentials directory:', err);
    }
  }

  /**
   * 加密数据
   */
  private encrypt(plaintext: string): EncryptedData {
    const salt = crypto.randomBytes(ENCRYPTION_CONFIG.saltLength);
    const iv = crypto.randomBytes(ENCRYPTION_CONFIG.ivLength);

    // 使用 PBKDF2 派生密钥
    const key = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000,
      ENCRYPTION_CONFIG.keyLength,
      'sha256'
    );

    const cipher = crypto.createCipheriv(
      ENCRYPTION_CONFIG.algorithm,
      key,
      iv
    );

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      algorithm: ENCRYPTION_CONFIG.algorithm,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      data: encrypted,
    };
  }

  /**
   * 解密数据
   */
  private decrypt(encrypted: EncryptedData): string {
    const salt = Buffer.from(encrypted.salt, 'hex');
    const iv = Buffer.from(encrypted.iv, 'hex');
    const tag = Buffer.from(encrypted.tag, 'hex');

    // 使用相同的盐值派生密钥
    const key = crypto.pbkdf2Sync(
      this.masterKey,
      salt,
      100000,
      ENCRYPTION_CONFIG.keyLength,
      'sha256'
    );

    const decipher = crypto.createDecipheriv(
      ENCRYPTION_CONFIG.algorithm,
      key,
      iv
    );

    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted.data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * 设置 API Key
   */
  async setApiKey(service: string, apiKey: string): Promise<void> {
    await this.ensureCredentialsDir();

    const encrypted = this.encrypt(apiKey);

    // 存储到 electron-store（已经有额外加密层）
    const apiKeys = this.store.get('apiKeys') || {};
    apiKeys[service] = encrypted;
    this.store.set('apiKeys', apiKeys);
  }

  /**
   * 获取 API Key
   */
  async getApiKey(service: string): Promise<string | null> {
    const apiKeys = this.store.get('apiKeys') || {};
    const encrypted = apiKeys[service];

    if (!encrypted) {
      return null;
    }

    try {
      return this.decrypt(encrypted);
    } catch (err) {
      console.error(`Failed to decrypt API key for ${service}:`, err);
      return null;
    }
  }

  /**
   * 删除 API Key
   */
  async deleteApiKey(service: string): Promise<void> {
    const apiKeys = this.store.get('apiKeys') || {};
    delete apiKeys[service];
    this.store.set('apiKeys', apiKeys);
  }

  /**
   * 设置主 API Key（默认服务）
   */
  async setDefaultApiKey(apiKey: string): Promise<void> {
    await this.setApiKey('default', apiKey);
  }

  /**
   * 获取主 API Key
   */
  async getDefaultApiKey(): Promise<string | null> {
    return this.getApiKey('default');
  }

  /**
   * 列出所有服务
   */
  listServices(): string[] {
    const apiKeys = this.store.get('apiKeys') || {};
    return Object.keys(apiKeys);
  }

  /**
   * 清空所有凭证
   */
  async clearAll(): Promise<void> {
    this.store.set('apiKeys', {});
    this.store.set('otherCredentials', {});
  }

  /**
   * 迁移旧配置中的 API Key
   * 从 config.json 迁移到加密存储
   */
  async migrateFromOldConfig(oldApiKey?: string): Promise<void> {
    if (oldApiKey) {
      await this.setDefaultApiKey(oldApiKey);
    }
  }

  /**
   * 导出凭证（用于备份，不推荐）
   * 返回解密后的凭证数据
   */
  async exportCredentials(): Promise<CredentialData> {
    const apiKeys: Record<string, string> = {};
    const encryptedKeys = this.store.get('apiKeys') || {};

    for (const [service, encrypted] of Object.entries(encryptedKeys)) {
      try {
        apiKeys[service] = this.decrypt(encrypted as any);
      } catch {
        apiKeys[service] = '';
      }
    }

    return {
      apiKeys,
      otherCredentials: this.store.get('otherCredentials') || {},
    };
  }

  /**
   * 导入凭证（用于恢复）
   */
  async importCredentials(data: CredentialData): Promise<void> {
    for (const [service, apiKey] of Object.entries(data.apiKeys)) {
      await this.setApiKey(service, apiKey);
    }

    this.store.set('otherCredentials', data.otherCredentials);
  }
}

// 单例
let credentialStoreInstance: CredentialStore | null = null;

/**
 * 获取 CredentialStore 单例
 */
export function getCredentialStore(): CredentialStore {
  if (!credentialStoreInstance) {
    credentialStoreInstance = new CredentialStore();
  }
  return credentialStoreInstance;
}
