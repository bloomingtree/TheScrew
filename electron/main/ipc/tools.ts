import { ipcMain } from 'electron';
import { toolManager } from '../tools/ToolManager';

/**
 * 注册工具集相关的 IPC 处理器
 */
export function registerToolsIpc(): void {
  // 获取工具集概览
  ipcMain.handle('tools:getToolSetsOverview', async (_event, conversationId: string) => {
    try {
      const toolSets = toolManager.getToolSetsOverview(conversationId);
      return {
        success: true,
        toolSets,
      };
    } catch (error: any) {
      console.error('[tools:getToolSetsOverview] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 激活工具集
  ipcMain.handle('tools:activateToolSet', async (_event, conversationId: string, toolSetName: string) => {
    try {
      const result = await toolManager.activateToolSet(conversationId, toolSetName);
      return result;
    } catch (error: any) {
      console.error('[tools:activateToolSet] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 估算活跃工具集的 token 数
  ipcMain.handle('tools:estimateActiveTokens', async (_event, conversationId: string) => {
    try {
      const tokens = toolManager.estimateActiveTokens(conversationId);
      return {
        success: true,
        tokens,
      };
    } catch (error: any) {
      console.error('[tools:estimateActiveTokens] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取当前激活的工具组列表
  ipcMain.handle('tools:getActiveGroups', async (_event, conversationId: string) => {
    try {
      const groups = toolManager.getActiveGroups(conversationId);
      return {
        success: true,
        groups,
      };
    } catch (error: any) {
      console.error('[tools:getActiveGroups] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Tools IPC handlers registered');
}
