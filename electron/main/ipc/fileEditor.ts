/**
 * File Editor IPC Handlers
 *
 * 处理文件编辑器相关的 IPC 请求：
 * - 读取文件
 * - 保存文件
 * - 创建/删除/重命名文件和目录
 * - 复制/移动文件
 * - 列出目录内容
 * - 文件监听
 */

import { ipcMain, dialog, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getMainWindow } from '../ipc/workspace';
import Store from 'electron-store';

const store = new Store();

// 文件监听器实例
let fileWatcher: fs.FSWatcher | null = null;
const watchedFiles = new Set<string>();

/**
 * 注册文件编辑器 IPC 处理器
 */
export function registerFileEditorHandlers() {
  // 读取文件
  ipcMain.handle('fileEditor:readFile', async (_event, filepath: string) => {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filepath)) {
        return { success: false, error: '文件不存在' };
      }

      // 读取文件内容
      const content = fs.readFileSync(filepath, 'utf-8');
      return { success: true, content };
    } catch (error: any) {
      console.error('Failed to read file:', error);
      return { success: false, error: error.message };
    }
  });

  // 保存文件
  ipcMain.handle('fileEditor:saveFile', async (_event, filepath: string, content: string) => {
    try {
      // 确保目录存在
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 写入文件
      fs.writeFileSync(filepath, content, 'utf-8');
      return { success: true };
    } catch (error: any) {
      console.error('Failed to save file:', error);
      return { success: false, error: error.message };
    }
  });

  // 创建文件
  ipcMain.handle('fileEditor:createFile', async (_event, filepath: string, content = '') => {
    try {
      // 确保目录存在
      const dir = path.dirname(filepath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 检查文件是否已存在
      if (fs.existsSync(filepath)) {
        return { success: false, error: '文件已存在' };
      }

      // 创建文件
      fs.writeFileSync(filepath, content, 'utf-8');
      return { success: true };
    } catch (error: any) {
      console.error('Failed to create file:', error);
      return { success: false, error: error.message };
    }
  });

  // 创建目录
  ipcMain.handle('fileEditor:createDirectory', async (_event, dirpath: string) => {
    try {
      // 检查目录是否已存在
      if (fs.existsSync(dirpath)) {
        return { success: false, error: '目录已存在' };
      }

      // 创建目录
      fs.mkdirSync(dirpath, { recursive: true });
      return { success: true };
    } catch (error: any) {
      console.error('Failed to create directory:', error);
      return { success: false, error: error.message };
    }
  });

  // 删除文件或目录
  ipcMain.handle('fileEditor:deleteFile', async (_event, filepath: string) => {
    try {
      // 检查路径是否存在
      if (!fs.existsSync(filepath)) {
        return { success: false, error: '文件或目录不存在' };
      }

      // 确认删除
      const mainWindow = getMainWindow();
      if (mainWindow) {
        const result = await dialog.showMessageBox(mainWindow, {
          type: 'question',
          buttons: ['取消', '删除'],
          defaultId: 0,
          title: '确认删除',
          message: `确定要删除 "${path.basename(filepath)}" 吗？`,
          detail: '此操作不可撤销。',
        });

        if (result.response === 0) {
          return { success: false, error: '用户取消' };
        }
      }

      // 删除文件或目录
      const stats = fs.statSync(filepath);
      if (stats.isDirectory()) {
        fs.rmSync(filepath, { recursive: true, force: true });
      } else {
        fs.unlinkSync(filepath);
      }

      return { success: true };
    } catch (error: any) {
      console.error('Failed to delete file:', error);
      return { success: false, error: error.message };
    }
  });

  // 重命名文件或目录
  ipcMain.handle('fileEditor:renameFile', async (_event, oldPath: string, newPath: string) => {
    try {
      // 检查旧路径是否存在
      if (!fs.existsSync(oldPath)) {
        return { success: false, error: '源文件不存在' };
      }

      // 检查新路径是否已存在
      if (fs.existsSync(newPath)) {
        return { success: false, error: '目标文件已存在' };
      }

      // 重命名
      fs.renameSync(oldPath, newPath);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to rename file:', error);
      return { success: false, error: error.message };
    }
  });

  // 复制文件或目录
  ipcMain.handle('fileEditor:copyFile', async (_event, sourcePath: string, targetPath: string) => {
    try {
      // 检查源路径是否存在
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: '源文件不存在' };
      }

      // 递归复制函数
      const copyRecursive = (src: string, dest: string) => {
        const stats = fs.statSync(src);
        if (stats.isDirectory()) {
          fs.mkdirSync(dest, { recursive: true });
          const files = fs.readdirSync(src);
          files.forEach(file => {
            copyRecursive(path.join(src, file), path.join(dest, file));
          });
        } else {
          fs.copyFileSync(src, dest);
        }
      };

      copyRecursive(sourcePath, targetPath);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to copy file:', error);
      return { success: false, error: error.message };
    }
  });

  // 移动文件或目录
  ipcMain.handle('fileEditor:moveFile', async (_event, sourcePath: string, targetPath: string) => {
    try {
      // 检查源路径是否存在
      if (!fs.existsSync(sourcePath)) {
        return { success: false, error: '源文件不存在' };
      }

      // 检查目标路径是否已存在
      if (fs.existsSync(targetPath)) {
        return { success: false, error: '目标文件已存在' };
      }

      // 移动（重命名）
      fs.renameSync(sourcePath, targetPath);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to move file:', error);
      return { success: false, error: error.message };
    }
  });

  // 列出目录内容
  ipcMain.handle('fileEditor:listDirectory', async (_event, dirpath: string) => {
    try {
      // 检查目录是否存在
      if (!fs.existsSync(dirpath)) {
        return { success: false, error: '目录不存在' };
      }

      // 检查是否为目录
      const stats = fs.statSync(dirpath);
      if (!stats.isDirectory()) {
        return { success: false, error: '不是目录' };
      }

      // 读取目录内容
      const entries = fs.readdirSync(dirpath, { withFileTypes: true });

      const result = entries.map(entry => {
        const fullPath = path.join(dirpath, entry.name);
        const entryStats = fs.statSync(fullPath);

        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? 'directory' : 'file',
          size: entryStats.size,
          modified: entryStats.mtimeMs,
        };
      });

      // 排序：目录在前，文件在后，按名称排序
      result.sort((a, b) => {
        if (a.type === b.type) {
          return a.name.localeCompare(b.name);
        }
        return a.type === 'directory' ? -1 : 1;
      });

      return { success: true, entries: result };
    } catch (error: any) {
      console.error('Failed to list directory:', error);
      return { success: false, error: error.message };
    }
  });

  // 监听文件变化
  ipcMain.handle('fileEditor:watchFiles', async (_event, dirpath: string) => {
    try {
      // 停止之前的监听
      if (fileWatcher) {
        fileWatcher.close();
        watchedFiles.clear();
      }

      // 检查目录是否存在
      if (!fs.existsSync(dirpath)) {
        return { success: false, error: '目录不存在' };
      }

      // 创建文件监听器
      fileWatcher = fs.watch(dirpath, { recursive: true }, (event, filename) => {
        if (!filename) return;

        const fullPath = path.join(dirpath, filename);

        // 检查文件是否在监听列表中
        if (watchedFiles.has(fullPath)) {
          const mainWindow = getMainWindow();
          if (mainWindow) {
            mainWindow.webContents.send('fileEditor:fileChanged', {
              event,
              path: fullPath,
            });
          }
        }
      });

      // 添加目录到监听列表
      watchedFiles.add(dirpath);

      return { success: true };
    } catch (error: any) {
      console.error('Failed to watch files:', error);
      return { success: false, error: error.message };
    }
  });

  // 停止监听文件
  ipcMain.handle('fileEditor:unwatchFiles', async () => {
    try {
      if (fileWatcher) {
        fileWatcher.close();
        fileWatcher = null;
      }
      watchedFiles.clear();
      return { success: true };
    } catch (error: any) {
      console.error('Failed to unwatch files:', error);
      return { success: false, error: error.message };
    }
  });

  // 使用系统默认程序打开文件
  ipcMain.handle('fileEditor:openWithSystem', async (_event, filepath: string) => {
    try {
      // 检查文件是否存在
      if (!fs.existsSync(filepath)) {
        return { success: false, error: '文件不存在' };
      }

      // 使用系统默认程序打开
      await shell.openPath(filepath);
      return { success: true };
    } catch (error: any) {
      console.error('Failed to open file with system:', error);
      return { success: false, error: error.message };
    }
  });
}
