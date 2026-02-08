import { ipcMain, dialog } from 'electron';
import { readFile, stat, readdir, writeFile } from 'fs/promises';
import path from 'path';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

/**
 * Pyodide 文件系统桥接 - 工作空间文件接口
 *
 * 这些处理器允许 Pyodide（运行在 Renderer 进程）
 * 通过 IPC 访问工作空间文件系统
 */
export interface WorkspaceFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
}

export function registerFileHandlers() {
  ipcMain.handle('file:select-image', async () => {
    try {
      const result = await dialog.showOpenDialog({
        properties: ['openFile'],
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'] }
        ]
      });

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true };
      }

      const filePath = result.filePaths[0];
      const fileStats = await stat(filePath);

      if (fileStats.size > MAX_IMAGE_SIZE) {
        return {
          canceled: true,
          error: `图片大小不能超过 ${MAX_IMAGE_SIZE / 1024 / 1024}MB`,
        };
      }

      const buffer = await readFile(filePath);
      const base64 = buffer.toString('base64');
      const ext = path.extname(filePath).slice(1);

      return {
        canceled: false,
        data: `data:image/${ext};base64,${base64}`,
        name: path.basename(filePath),
      };
    } catch (error: any) {
      return { canceled: true, error: error.message };
    }
  });

  ipcMain.handle('file:save', async (_event, content: string, filename: string) => {
    try {
      const result = await dialog.showSaveDialog({
        defaultPath: filename,
        filters: [
          { name: 'Text Files', extensions: ['txt'] },
          { name: 'Markdown Files', extensions: ['md'] },
          { name: 'All Files', extensions: ['*'] }
        ]
      });

      if (result.canceled || !result.filePath) {
        return { canceled: true };
      }

      const { writeFile } = await import('fs/promises');
      await writeFile(result.filePath, content, 'utf-8');

      return { canceled: false, filePath: result.filePath };
    } catch (error: any) {
      return { canceled: true, error: error.message };
    }
  });

  // ============================================================================
  // Pyodide 文件系统桥接 - IPC 处理器
  // ============================================================================

  /**
   * 列出工作空间中的所有文件
   * 用于 Pyodide 挂载工作空间到虚拟文件系统
   */
  ipcMain.handle('pyodide:list-files', async (_event, workspacePath: string) => {
    try {
      const files: WorkspaceFile[] = [];

      async function scanDir(dir: string, relativePath = '') {
        const entries = await readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          // 跳过隐藏文件和 node_modules
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }

          const fullPath = path.join(dir, entry.name);
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            files.push({
              name: entry.name,
              path: relPath,
              type: 'directory'
            });
            await scanDir(fullPath, relPath);
          } else if (entry.isFile()) {
            const stats = await stat(fullPath);
            files.push({
              name: entry.name,
              path: relPath,
              type: 'file',
              size: stats.size,
              modified: stats.mtime
            });
          }
        }
      }

      await scanDir(workspacePath);

      return { success: true, files };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * 读取工作空间文件内容
   * 用于将文件加载到 Pyodide 的 MEMFS
   */
  ipcMain.handle('pyodide:read-file', async (_event, workspacePath: string, relativePath: string) => {
    try {
      // 安全检查：确保路径在工作空间内
      const resolvedPath = path.resolve(workspacePath, relativePath);
      if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
        return { success: false, error: '路径遍历检测：尝试访问工作空间外部的文件' };
      }

      const content = await readFile(resolvedPath, 'utf-8');

      return { success: true, content, path: relativePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * 写入文件到工作空间
   * 用于将 Pyodide MEMFS 中的更改同步到本地文件系统
   */
  ipcMain.handle('pyodide:write-file', async (_event, workspacePath: string, relativePath: string, content: string) => {
    try {
      // 安全检查：确保路径在工作空间内
      const resolvedPath = path.resolve(workspacePath, relativePath);
      if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
        return { success: false, error: '路径遍历检测：尝试访问工作空间外部的文件' };
      }

      // 确保目录存在
      const dir = path.dirname(resolvedPath);
      const { mkdir } = await import('fs/promises');
      await mkdir(dir, { recursive: true });

      await writeFile(resolvedPath, content, 'utf-8');

      return { success: true, path: relativePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  /**
   * 删除工作空间文件
   * 用于清理临时文件
   */
  ipcMain.handle('pyodide:delete-file', async (_event, workspacePath: string, relativePath: string) => {
    try {
      // 安全检查：确保路径在工作空间内
      const resolvedPath = path.resolve(workspacePath, relativePath);
      if (!resolvedPath.startsWith(path.resolve(workspacePath))) {
        return { success: false, error: '路径遍历检测：尝试访问工作空间外部的文件' };
      }

      const { unlink } = await import('fs/promises');
      await unlink(resolvedPath);

      return { success: true, path: relativePath };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  console.log('[IPC] Pyodide file system bridge handlers registered');
}
