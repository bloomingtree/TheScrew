/**
 * 凭证 IPC 处理器
 * 处理加密的 API Keys 等敏感信息的 IPC 通信
 */

import { ipcMain } from 'electron';
import { getCredentialStore } from '../config/CredentialStore';

/**
 * 注册凭证 IPC 处理器
 */
export function registerCredentialHandlers(): void {
  const credentialStore = getCredentialStore();

  // 获取默认 API Key
  ipcMain.handle('credentials:getApiKey', async () => {
    return await credentialStore.getDefaultApiKey();
  });

  // 设置默认 API Key
  ipcMain.handle('credentials:setApiKey', async (_event, apiKey: string) => {
    await credentialStore.setDefaultApiKey(apiKey);
    return { success: true };
  });

  // 获取指定服务的 API Key
  ipcMain.handle('credentials:getApiKeyByService', async (_event, service: string) => {
    return await credentialStore.getApiKey(service);
  });

  // 设置指定服务的 API Key
  ipcMain.handle('credentials:setApiKeyByService', async (_event, service: string, apiKey: string) => {
    await credentialStore.setApiKey(service, apiKey);
    return { success: true };
  });

  // 删除 API Key
  ipcMain.handle('credentials:deleteApiKey', async (_event, service: string) => {
    await credentialStore.deleteApiKey(service);
    return { success: true };
  });

  // 列出所有服务
  ipcMain.handle('credentials:listServices', async () => {
    return credentialStore.listServices();
  });

  // 清空所有凭证
  ipcMain.handle('credentials:clearAll', async () => {
    await credentialStore.clearAll();
    return { success: true };
  });

  // 迁移旧配置中的 API Key
  ipcMain.handle('credentials:migrateFromOldConfig', async (_event, oldApiKey?: string) => {
    await credentialStore.migrateFromOldConfig(oldApiKey);
    return { success: true };
  });
}
