import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { registerChatHandlers } from './ipc/chat';
import { registerConfigHandlers } from './ipc/config';
import { registerFileHandlers } from './ipc/file';
import { registerWorkspaceHandlers } from './ipc/workspace';
import { registerTemplateHandlers } from './ipc/template';
import { registerWordHandlers } from './ipc/word';
import { registerConversationHandlers } from './ipc/conversation';
import { setWorkspacePath } from './tools/FileTools';
import { initDatabase } from './db';

const store = new Store();

let mainWindow: BrowserWindow | null = null;
function createWindow() {
mainWindow = new BrowserWindow({
  title: '螺丝钉',
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
  autoHideMenuBar: true
  });
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  Menu.setApplicationMenu(null);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // 初始化数据库
  await initDatabase();

  registerChatHandlers(store);
  registerConfigHandlers(store);
  registerFileHandlers();
  registerWorkspaceHandlers(store);
  registerTemplateHandlers();
  registerWordHandlers();
  registerConversationHandlers();
  createWindow();

  const savedWorkspacePath = store.get('workspacePath') as string | undefined;
  if (savedWorkspacePath) {
    setWorkspacePath(savedWorkspacePath);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
