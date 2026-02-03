import { ipcMain, dialog } from 'electron';
import Store from 'electron-store';
import { setWorkspacePath, getWorkspacePath } from '../tools/FileTools';
import * as fs from 'fs';
import * as path from 'path';

export function registerWorkspaceHandlers(store: Store) {
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
}