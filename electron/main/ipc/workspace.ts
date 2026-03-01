import { ipcMain, dialog } from 'electron';
import Store from 'electron-store';
import { setWorkspacePath, getWorkspacePath } from '../tools/FileTools';
import { getWorkspaceManager } from '../config/WorkspaceManager';
import type {
  WorkspaceInfo,
  CreateWorkspaceOptions,
  SwitchWorkspaceOptions,
} from '../config/WorkspaceConfig';
import * as fs from 'fs';
import * as path from 'path';

export function registerWorkspaceHandlers(store: Store) {
  const workspaceManager = getWorkspaceManager();
  ipcMain.handle('workspace:select', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: '选择工作空间文件夹',
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { path: null };
      }

      const selectedPath = result.filePaths[0];
      setWorkspacePath(selectedPath);
      store.set('workspacePath', selectedPath);
      return { path: selectedPath };
    } catch (error: any) {
      return { path: null, error: error.message };
    }
  });

  ipcMain.handle('workspace:get_path', async () => {
    const workspacePath = getWorkspacePath();
    return { path: workspacePath };
  });

  ipcMain.handle('workspace:set_path', async (_event, pathStr: string) => {
    setWorkspacePath(pathStr);
    store.set('workspacePath', pathStr);
    return { success: true, path: pathStr };
  });

  ipcMain.handle('workspace:list_files', async () => {
    try {
      const workspacePath = getWorkspacePath();
      if (!workspacePath) {
        return { success: false, error: '未设置工作空间' };
      }

      // 读取工作空间目录
      const entries = fs.readdirSync(workspacePath, { withFileTypes: true });
      const files = entries
        .filter(entry => !entry.name.startsWith('.')) // 过滤隐藏文件
        .map(entry => {
          const fullPath = path.join(workspacePath, entry.name);
          const stats = fs.statSync(fullPath);
          return {
            name: entry.name,
            path: fullPath,
            type: entry.isDirectory() ? 'directory' : 'file',
            size: entry.isFile() ? stats.size : undefined,
            modified: stats.mtime.getTime(),
          };
        })
        .sort((a, b) => {
          // 目录优先，然后按名称排序
          if (a.type === 'directory' && b.type !== 'directory') return -1;
          if (a.type !== 'directory' && b.type === 'directory') return 1;
          return a.name.localeCompare(b.name);
        });

      return { success: true, files };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // ========== 新工作区管理 API ==========

  // 获取工作区列表
  ipcMain.handle('workspace:listWorkspaces', async () => {
    try {
      const workspaces = workspaceManager.listWorkspaces();
      return { success: true, workspaces };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 创建新工作区
  ipcMain.handle('workspace:createWorkspace', async (_event, options: CreateWorkspaceOptions) => {
    try {
      const workspace = await workspaceManager.createWorkspace(options);
      return { success: true, workspace };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 切换工作区
  ipcMain.handle('workspace:switchWorkspace', async (_event, workspaceId: string, options?: SwitchWorkspaceOptions) => {
    try {
      const workspace = await workspaceManager.switchWorkspace(workspaceId, options);
      return { success: true, workspace };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 获取当前工作区信息
  ipcMain.handle('workspace:getCurrentWorkspace', async () => {
    try {
      const workspace = workspaceManager.getCurrentWorkspace();
      return { success: true, workspace };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 删除工作区
  ipcMain.handle('workspace:deleteWorkspace', async (_event, workspaceId: string, deleteFiles?: boolean) => {
    try {
      const success = await workspaceManager.deleteWorkspace(workspaceId, deleteFiles);
      return { success };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 更新工作区元数据
  ipcMain.handle('workspace:updateWorkspace', async (
    _event,
    workspaceId: string,
    updates: Partial<Pick<WorkspaceInfo, 'name' | 'description' | 'agentProfile'>>
  ) => {
    try {
      const workspace = await workspaceManager.updateWorkspace(workspaceId, updates);
      return { success: true, workspace };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // 验证工作区结构
  ipcMain.handle('workspace:validateWorkspace', async (_event, workspacePath: string) => {
    try {
      const result = await workspaceManager.validateWorkspace(workspacePath);
      return { success: true, validation: result };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });
}