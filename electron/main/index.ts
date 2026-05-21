import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
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

import { initDatabase } from './db';
import { getSkillManager, initializeCore } from './core';
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
import { registerPptxHandlers } from './ipc/pptx';
import { registerPdfHandlers } from './ipc/pdf';
import { registerP2PHandlers } from './ipc/p2p';
import { registerFileEditorHandlers } from './ipc/fileEditor';
import { getTransferService } from './p2p/TransferService';
import { registerAttachmentHandlers } from './ipc/attachments';
import { attachmentTools } from './tools/AttachmentTools';
import { officeCLITools, officeCLIToolGroup } from './tools/OfficeCLITools';

const store = new Store();

// 硬件加速配置：必须在 app.whenReady() 之前设置
// 从 .config/config.json 读取（与 AppConfigStore 使用相同的存储位置）
function loadHardwareAccelerationSetting(): boolean {
  try {
    let configDir: string;
    if (app.isPackaged) {
      configDir = path.join(path.dirname(app.getPath('exe')), '.config');
    } else {
      try {
        configDir = path.join(app.getAppPath(), '.config');
      } catch {
        configDir = path.resolve(__dirname, '../../..', '.config');
      }
    }
    const configPath = path.join(configDir, 'config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(raw);
      const hwAccel = config?.settings?.hardwareAcceleration;
      console.log(`[Main] 硬件加速配置值: ${hwAccel} (来源: ${configPath})`);
      return hwAccel !== false; // undefined 或 true 都表示启用
    }
    console.log('[Main] 配置文件不存在，硬件加速默认启用');
    return true;
  } catch (e) {
    console.warn('[Main] 读取硬件加速配置失败，默认启用:', e);
    return true;
  }
}

const hwAccelEnabled = loadHardwareAccelerationSetting();
if (!hwAccelEnabled) {
  app.disableHardwareAcceleration();
  console.log('[Main] 硬件加速已禁用（用户配置）');
} else {
  console.log('[Main] 硬件加速已启用');
}

let mainWindow: BrowserWindow | null = null;
function createWindow() {
mainWindow = new BrowserWindow({
  title: '螺丝帽',
  width: 1200,
  height: 800,
  minWidth: 800,
  minHeight: 600,
  icon: path.join(__dirname, '../../build/icon.png'),
  webPreferences: {
    preload: path.join(__dirname, '../preload/index.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
  autoHideMenuBar: true
  });

  // 设置主窗口实例，用于文件监听通知
  setMainWindow(mainWindow);

  // 打印硬件加速运行时状态
  console.log(`[Main] 窗口创建完成 - 硬件加速状态: GPU进程=${app.getAppPath().includes('gpu') ? '已启动' : '检查中'}`);
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow!.webContents.executeJavaScript(
      'console.log("[Renderer] 硬件加速检查:", { gpu: navigator.gpu, webgl: !!document.createElement("canvas").getContext("webgl2") })'
    );
  });

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
  console.log('[Main] Workspace path restored from store:', workspacePath || '(not set)');

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
  const toolManager = getToolManager();
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

  // 注册 OfficeCLI 工具到 ToolManager
  for (const tool of officeCLITools) {
    toolManager.registerTool(tool);
  }
  toolManager.registerToolGroup(officeCLIToolGroup);

  // 注册工具集元数据
  registerToolSetMeta(bashToolSet);
  registerToolSetMeta({
    name: 'attachments',
    description: '附件管理工具',
    capabilities: ['列出附件', '获取附件内容', '保存附件到工作空间', '多文件工作流处理'],
    keywords: ['附件', '上传', '文件', '文档', '工作流'],
    estimatedTokens: 300,
  });
  registerToolSetMeta({
    name: 'officecli',
    description: 'Office 文档操作（Word/Excel/PowerPoint）',
    capabilities: ['创建/查看/编辑文档', 'DOM 操作（增删改查）', '元素移动/交换', '批量操作', '原始 XML 操作'],
    keywords: ['word', 'excel', 'powerpoint', 'docx', 'xlsx', 'pptx', 'office', '文档'],
    estimatedTokens: 800,
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
  // Reports handlers removed
  registerCredentialHandlers();
  registerWordHandlers();
  registerFilePreviewHandlers();
  registerPptxHandlers();
  registerPdfHandlers();
  registerP2PHandlers();
  registerFileEditorHandlers();
  registerAttachmentHandlers();

  // TODO: P2P 传输服务待调试和完善后再启用
  // 启动 P2P 传输服务（HTTP 服务器）
  // const transferService = getTransferService();
  // await transferService.start().catch(err => {
  //   console.error('[Main] Failed to start transfer service:', err);
  // });

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
