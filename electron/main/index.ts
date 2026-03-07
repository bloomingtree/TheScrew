import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import Store from 'electron-store';
import { registerChatHandlers } from './ipc/chat';
import { registerContextHandlers } from './ipc/chat';
import { registerConfigHandlers } from './ipc/config';
import { registerFileHandlers } from './ipc/file';
import { registerWorkspaceHandlers, setMainWindow } from './ipc/workspace';
import { registerConversationHandlers } from './ipc/conversation';
import { registerToolsIpc } from './ipc/tools';
import { registerMemoryHandlers } from './ipc/memory';
import { registerSubagentHandlers } from './ipc/subagents';
import { registerSkillsHandlers } from './ipc/skills';
import { registerSchedulerHandlers } from './ipc/scheduler';
import { registerPythonHandlers } from './ipc/python';
import { initDatabase } from './db';
import { getSkillManager, initializeCore } from './core';
import { getToolRegistry } from './core/ToolRegistry';
import { getToolManager } from './tools/ToolManager';
import { getCronService, HeartbeatService, CronJob, setCronService, setHeartbeatService } from './scheduler';
import { cronTools, heartbeatTools } from './tools/SchedulerTools';
import { bashTools, bashToolSet } from './tools/BashTools';
import { setWorkspacePath } from './tools/FileTools';
import { registerToolSetMeta } from './tools/ToolManager';
// Reports functionality removed
import { registerCredentialHandlers } from './ipc/credentials';
import { registerWordHandlers } from './ipc/word';
import { registerFilePreviewHandlers } from './ipc/filePreview';
import { registerP2PHandlers } from './ipc/p2p';
import { registerFileEditorHandlers } from './ipc/fileEditor';
import { getTransferService } from './p2p/TransferService';
import { registerAttachmentHandlers } from './ipc/attachments';
import { attachmentTools } from './tools/AttachmentTools';

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

  // 设置主窗口实例，用于文件监听通知
  setMainWindow(mainWindow);

  if (process.env.NODE_ENV === 'development') {
    // 支持动态端口（Vite 可能因为端口冲突使用其他端口）
    const devServerPort = process.env.VITE_DEV_SERVER_PORT || '5173';
    mainWindow.loadURL(`http://localhost:${devServerPort}`);
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

  // 初始化核心系统
  await initializeCore();

  // 初始化技能管理器
  await getSkillManager().initialize();

  // 将现有工具适配到新的 ToolRegistry
  const toolManager = getToolManager();
  const existingTools = toolManager.getAllTools();
  const toolRegistry = getToolRegistry();
  for (const tool of existingTools) {
    toolRegistry.register({
      name: () => tool.name,
      description: () => tool.description,
      parameters: () => tool.parameters,
      execute: async (args) => {
        const result = await tool.handler(args);
        return JSON.stringify(result);
      },
    });
  }

  // ============================================================================
  // 初始化定时任务系统 (CronService + HeartbeatService)
  // ============================================================================

  // 初始化 CronService 并设置任务回调
  const userDataPath = app.getPath('userData');
  const cronService = getCronService();

  // 设置 cron 任务执行回调
  // 当定时任务触发时，通过 chat IPC 处理消息
  cronService.onJob = async (job: CronJob): Promise<string | undefined> => {
    console.log(`[CronService] Executing job: ${job.name}`);

    // TODO: 这里需要集成到实际的聊天系统
    // 暂时返回任务执行确认
    return `Executed cron job: ${job.name}`;
  };

  await cronService.start();

  // 初始化 HeartbeatService (如果设置了工作空间)
  const workspacePath = store.get('workspacePath') as string | undefined;

  // 初始化 FileTools 的全局变量
  setWorkspacePath(workspacePath || null);

  if (workspacePath) {
    const heartbeatService = new HeartbeatService(
      {
        workspace_path: workspacePath,
        interval_seconds: 30 * 60, // 30 分钟
        enabled: true,
      },
      async (message: string) => {
        // Heartbeat 回调 - 处理 HEARTBEAT.md 中的任务
        console.log('[HeartbeatService] Processing heartbeat message');
        // TODO: 集成到实际的聊天系统
        return 'HEARTBEAT_OK';
      }
    );

    setHeartbeatService(heartbeatService);
    await heartbeatService.start();
  }

  // 注册调度器工具到 ToolManager
  for (const tool of [...cronTools, ...heartbeatTools]) {
    toolManager.registerTool(tool);
  }

  // 注册 Bash 工具到 ToolManager
  for (const tool of bashTools) {
    toolManager.registerTool(tool);
  }

  // 注册附件工具到 ToolManager
  for (const tool of attachmentTools) {
    toolManager.registerTool(tool);
  }

  // 注册工具集元数据
  registerToolSetMeta(bashToolSet);
  registerToolSetMeta({
    name: 'attachments',
    description: '附件管理工具',
    capabilities: ['列出附件', '获取附件内容', '保存附件到工作空间', '多文件工作流处理'],
    keywords: ['附件', '上传', '文件', '文档', '工作流'],
    estimatedTokens: 300,
  });

  // 注册 IPC 处理器
  registerChatHandlers(store);
  registerConfigHandlers(store);
  registerContextHandlers();
  registerFileHandlers();
  registerWorkspaceHandlers(store);
  registerConversationHandlers();
  registerToolsIpc();
  registerMemoryHandlers();
  registerSubagentHandlers();
  registerSkillsHandlers();
  registerSchedulerHandlers();
  registerPythonHandlers();
  // Reports handlers removed
  registerCredentialHandlers();
  registerWordHandlers();
  registerFilePreviewHandlers();
  registerP2PHandlers();
  registerFileEditorHandlers();
  registerAttachmentHandlers();

  // 启动 P2P 传输服务（HTTP 服务器）
  const transferService = getTransferService();
  await transferService.start().catch(err => {
    console.error('[Main] Failed to start transfer service:', err);
  });

  createWindow();
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

// Cleanup when app quits
app.on('before-quit', () => {
  const cronService = getCronService();
  cronService.stop();
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
