import { ipcMain } from 'electron';
import { getPermissionManager, AuditLogEntry } from '../tools/PermissionManager';

/**
 * 注册权限管理相关的 IPC 处理器
 */
export function registerPermissionHandlers(): void {
  const pm = getPermissionManager();

  // 获取审计日志
  ipcMain.handle('permission:getAuditLog', (_event, limit?: number) => {
    try {
      const log = pm.getAuditLog(limit);
      return {
        success: true,
        log,
      };
    } catch (error: any) {
      console.error('[permission:getAuditLog] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 清空审计日志
  ipcMain.handle('permission:clearAuditLog', () => {
    try {
      pm.clearAuditLog();
      return { success: true };
    } catch (error: any) {
      console.error('[permission:clearAuditLog] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 响应确认请求（Phase 2 将使用此接口）
  ipcMain.handle('permission:respond', (_event, requestId: string, response: { approved: boolean; skipForSession?: boolean; note?: string }) => {
    try {
      pm.respondConfirmation(requestId, response);

      // 如果用户选择免确认且已批准，自动添加会话级免确认
      if (response.approved && response.skipForSession && response.note) {
        // note 字段携带工具名称（由前端在调用时设置）
        pm.addSessionOverride(response.note);
      }

      return { success: true };
    } catch (error: any) {
      console.error('[permission:respond] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 添加会话级免确认
  ipcMain.handle('permission:addSessionOverride', (_event, toolName: string) => {
    try {
      pm.addSessionOverride(toolName);
      return { success: true };
    } catch (error: any) {
      console.error('[permission:addSessionOverride] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 移除会话级免确认
  ipcMain.handle('permission:removeSessionOverride', (_event, toolName: string) => {
    try {
      pm.removeSessionOverride(toolName);
      return { success: true };
    } catch (error: any) {
      console.error('[permission:removeSessionOverride] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取当前所有会话级免确认的工具列表
  ipcMain.handle('permission:getSessionOverrides', () => {
    try {
      const overrides = pm.getSessionOverrides();
      return {
        success: true,
        overrides,
      };
    } catch (error: any) {
      console.error('[permission:getSessionOverrides] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 获取工具的风险等级描述
  ipcMain.handle('permission:getRiskDescription', (_event, toolName: string, args?: Record<string, any>) => {
    try {
      const description = pm.getRiskDescription(toolName, args || {});
      const riskLevel = pm.getRiskLevel(toolName);
      return {
        success: true,
        description,
        riskLevel,
      };
    } catch (error: any) {
      console.error('[permission:getRiskDescription] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 重置会话（新对话开始时调用）
  ipcMain.handle('permission:resetSession', () => {
    try {
      pm.resetSession();
      return { success: true };
    } catch (error: any) {
      console.error('[permission:resetSession] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Permission handlers registered');
}
