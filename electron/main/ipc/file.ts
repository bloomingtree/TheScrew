import { ipcMain, dialog } from 'electron';
import { readFile, stat } from 'fs/promises';
import path from 'path';

const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

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
}
