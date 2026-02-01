import { ipcMain, dialog } from 'electron';
import Store from 'electron-store';
import { setWorkspacePath, getWorkspacePath } from '../tools/FileTools';

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
    const path = getWorkspacePath();
    return { path };
  });

  ipcMain.handle('workspace:set_path', async (_event, path: string) => {
    setWorkspacePath(path);
    store.set('workspacePath', path);
    return { success: true, path };
  });
}