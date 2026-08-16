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
import { getCronService, HeartbeatService, CronJob, setCronService, setHeartbeatService, getHeartbeatService } from './scheduler';
import { dispatchJob } from './scheduler/JobDispatcher';
import { cronTools, heartbeatTools } from './tools/SchedulerTools';
import { bashTools, bashToolSet } from './tools/BashTools';
import { setWorkspacePath } from './tools/FileTools';
import { registerToolSetMeta } from './tools/ToolManager';
import { PythonPackageManager, setPythonPackageManager } from './tools/PythonPackageManager';
import { getAppConfigStore } from './config/AppConfigStore';
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
import { registerPermissionHandlers } from './ipc/permission';
import { registerTasksHandlers } from './ipc/tasks';
import { registerMemoryConsolidateJob, checkAndRunConsolidateOnStartup } from './scheduler/MemoryConsolidator';
import { getSessionSummarizer } from './memory/SessionSummarizer';
import { getConversationWithMessages } from './db';
import { attachmentTools } from './tools/AttachmentTools';
import { officeCLITools, officeCLIToolGroup } from './tools/OfficeCLITools';
import { knowledgeTools, knowledgeToolGroup } from './tools/KnowledgeTools';
import { taskTools } from './tools/TaskTools';
import { memoryTools } from './tools/MemoryTools';
import { remoteTools, remoteToolGroup } from './tools/RemoteTools';
import { dbTools, dbToolGroup } from './tools/DbTools';
import { pdfTools, pdfToolGroup } from './tools/PdfTools';
import { reportTools, reportToolGroup } from './tools/ReportTools';
import { pptxDesignTools, pptxDesignToolGroup } from './tools/PptxDesignTools';

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

// 设置 AppUserModelId（必须在 app.whenReady 之前）
// 否则 Windows 通知中心会显示为 "Electron" 而非应用名，且图标不正确。
// 值取自 electron-builder.json 的 appId。
app.setAppUserModelId('com.luosiding.app');

// 初始化当前激活对话的全局占位（定时任务注入消息时用）
// 由 chat:stream 和 conversation:setActive IPC 实时更新。
(globalThis as any)[Symbol.for('zero-employee:activeConversationId')] = null;

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

  // 设置 cron 任务执行回调：由 JobDispatcher 统一分发（提醒用户型 / Agent 自驱动型）
  cronService.onJob = async (job: CronJob): Promise<string | undefined> => {
    console.log(`[CronService] Job triggered: ${job.name} (target=${job.payload.target})`);
    try {
      return await dispatchJob(job, 'cron');
    } catch (e: any) {
      console.error(`[CronService] dispatchJob failed for '${job.name}':`, e);
      return undefined;
    }
  };

  await cronService.start();

  // P2-3: 注册每日凌晨 3:00 的记忆整理任务（幂等：已存在则跳过）
  await registerMemoryConsolidateJob(cronService);

  // P2-3: 启动补偿检查——若距上次 consolidate > 24h 立即派发一次（fire-and-forget）
  await checkAndRunConsolidateOnStartup();

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
        // Heartbeat 回调：构造虚拟 CronJob（target=agent），复用 JobDispatcher 走 agent turn
        console.log('[HeartbeatService] Heartbeat triggered, dispatching as agent task');
        const virtualJob: CronJob = {
          id: 'heartbeat',
          name: '后台巡检',
          enabled: true,
          schedule: { kind: 'every', every_ms: 0 },
          payload: { target: 'agent', message },
          state: {},
          created_at_ms: Date.now(),
          updated_at_ms: Date.now(),
          delete_after_run: false,
        };
        try {
          return await dispatchJob(virtualJob, 'heartbeat');
        } catch (e: any) {
          console.error('[HeartbeatService] dispatchJob failed:', e);
          return 'HEARTBEAT_OK';  // 失败不阻塞下次心跳
        }
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

  // ============================================================================
  // 初始化 Python 包管理器
  // ============================================================================
  const appConfigStore = getAppConfigStore();
  const pythonConfig = appConfigStore.getPythonConfig();
  const pythonPath = appConfigStore.getPythonPath();

  if (pythonConfig.enabled && fs.existsSync(pythonPath)) {
    const pythonPackageManager = new PythonPackageManager(pythonPath, pythonConfig);
    setPythonPackageManager(pythonPackageManager);

    // If mirror is configured, write pip.ini
    if (pythonConfig.mirrorUrl) {
      await pythonPackageManager.updatePipConfig();
    }

    console.log('[Main] Python package manager initialized:', pythonPath);
  } else {
    console.log('[Main] Python environment disabled or not found, skipping. enabled=', pythonConfig.enabled, 'path=', pythonPath);
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

  // 注册知识库工具到 ToolManager
  for (const tool of knowledgeTools) {
    toolManager.registerTool(tool);
  }
  registerToolSetMeta({
    name: knowledgeToolGroup.name,
    description: knowledgeToolGroup.description,
    capabilities: ['知识库索引', '全文搜索', '增量更新', '文档文本提取'],
    keywords: knowledgeToolGroup.keywords,
    estimatedTokens: 600,
  });

  // 注册任务管理工具到 ToolManager
  for (const tool of taskTools) {
    toolManager.registerTool(tool);
  }
  registerToolSetMeta({
    name: 'task',
    description: '任务管理工具（创建、列表、更新、完成）',
    capabilities: ['任务创建', '状态追踪', '优先级管理', '子任务'],
    keywords: ['任务', '待办', 'TODO', 'task', '管理', '追踪'],
    estimatedTokens: 400,
  });

  // 注册长期记忆工具到 ToolManager（memory_save / memory_search / memory_read）
  for (const tool of memoryTools) {
    toolManager.registerTool(tool);
  }
  registerToolSetMeta({
    name: 'memory',
    description: '长期记忆管理（写入/搜索/读取）',
    capabilities: ['写入记忆', '搜索记忆', '读取记忆', '章节合并'],
    keywords: ['记忆', 'memory', '记住', '笔记', '偏好', '长期'],
    estimatedTokens: 500,
  });

  // 注册远程操作工具到 ToolManager
  for (const tool of remoteTools) {
    toolManager.registerTool(tool);
  }
  toolManager.registerToolGroup(remoteToolGroup);
  registerToolSetMeta({
    name: remoteToolGroup.name,
    description: 'SSH/WinRM 远程服务器管理',
    capabilities: ['SSH远程执行', 'WinRM远程执行', '服务器列表'],
    keywords: remoteToolGroup.keywords,
    estimatedTokens: 500,
  });

  // 注册数据库工具到 ToolManager
  for (const tool of dbTools) {
    toolManager.registerTool(tool);
  }
  toolManager.registerToolGroup(dbToolGroup);
  registerToolSetMeta({
    name: dbToolGroup.name,
    description: '数据库操作（Oracle/SQLite）',
    capabilities: ['SQL查询', '数据执行', '表结构', '连接管理'],
    keywords: dbToolGroup.keywords,
    estimatedTokens: 600,
  });

  // 注册 PDF 工具到 ToolManager
  for (const tool of pdfTools) {
    toolManager.registerTool(tool);
  }
  toolManager.registerToolGroup(pdfToolGroup);
  registerToolSetMeta({
    name: pdfToolGroup.name,
    description: 'PDF 处理（合并/拆分/水印/旋转）',
    capabilities: ['PDF合并', 'PDF拆分', 'PDF水印', 'PDF旋转', 'PDF提取'],
    keywords: pdfToolGroup.keywords,
    estimatedTokens: 500,
  });

  // 注册报表工具到 ToolManager
  for (const tool of reportTools) {
    toolManager.registerTool(tool);
  }
  toolManager.registerToolGroup(reportToolGroup);
  registerToolSetMeta({
    name: reportToolGroup.name,
    description: '报表生成（周报/月报/数据汇总）',
    capabilities: ['周报', '月报', '数据汇总', '模板渲染'],
    keywords: reportToolGroup.keywords,
    estimatedTokens: 400,
  });

  // 注册 PPT 设计工具到 ToolManager
  for (const tool of pptxDesignTools) {
    toolManager.registerTool(tool);
  }
  toolManager.registerToolGroup(pptxDesignToolGroup);
  registerToolSetMeta({
    name: pptxDesignToolGroup.name,
    description: 'PPT 设计（配色方案、数据图表）',
    capabilities: ['配色方案', '数据图表', '主题应用'],
    keywords: pptxDesignToolGroup.keywords,
    estimatedTokens: 400,
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
  registerPermissionHandlers();
  registerTasksHandlers();

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
  // Heartbeat 也要停止（之前遗漏）
  getHeartbeatService()?.stop();

  // P2-1: 应用退出时触发当前会话总结（fire-and-forget，不阻塞退出）
  // 写文件 + 调 LLM 在后台执行，写不完就丢；下次启动还能从对话 DB 重新总结
  try {
    const activeId = (globalThis as any)[Symbol.for('zero-employee:activeConversationId')] as string | null;
    if (activeId) {
      const conv = getConversationWithMessages(activeId);
      if (conv && conv.messages && conv.messages.length >= 6) {
        const messages = conv.messages.map((m: any) => ({
          id: m.id,
          role: m.role,
          content: m.content ?? '',
          timestamp: m.timestamp ?? Date.now(),
        }));
        // fire-and-forget，不 await，让退出立即完成
        getSessionSummarizer()
          .summarizeSession(activeId, messages, conv.title)
          .catch((e: unknown) => {
            console.error('[Main] Exit summary failed:', e);
          });
        console.log(`[Main] Triggered exit summary for conversation ${activeId}`);
      }
    }
  } catch (e: any) {
    console.error('[Main] Failed to trigger exit summary:', e);
  }
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
