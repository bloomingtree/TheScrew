/**
 * 工作区管理器
 * 基于 OpenClaw 的工作区设计理念
 * 管理多个工作区的创建、切换、删除等操作
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { app } from 'electron';
import Store from 'electron-store';
import {
  WorkspaceInfo,
  WorkspaceMetadata,
  WorkspacesConfig,
  CreateWorkspaceOptions,
  SwitchWorkspaceOptions,
  WorkspaceStructure,
  WorkspaceValidationResult,
} from './WorkspaceConfig';
import { CONFIG_DIR_NAME } from './PathManager';

/**
 * 工作区管理器类
 */
export class WorkspaceManager {
  private configStore: Store<WorkspacesConfig>;
  private currentWorkspace: WorkspaceInfo | null = null;

  constructor() {
    // 工作区列表配置存储在 {userData}/workspaces.json
    this.configStore = new Store<WorkspacesConfig>({
      name: 'workspaces',
    });

    this.initialize();
  }

  /**
   * 初始化工作区管理器
   */
  private async initialize(): Promise<void> {
    // 确保有默认配置
    const config = this.configStore.store;
    if (!config.activeWorkspaceId) {
      config.activeWorkspaceId = null;
    }
    if (!config.recentWorkspaces) {
      config.recentWorkspaces = [];
    }
  }

  /**
   * 获取工作区结构
   */
  getWorkspaceStructure(workspacePath: string): WorkspaceStructure {
    return {
      workspaceDir: path.join(workspacePath, '.workspace'),
      stateDir: path.join(workspacePath, '.workspace', 'state'),
      configDir: path.join(workspacePath, CONFIG_DIR_NAME),
      memoryDir: path.join(workspacePath, 'memory'),
      dailyNotesDir: path.join(workspacePath, 'memory', 'daily_notes'),
    };
  }

  /**
   * 生成工作区 ID
   */
  private generateWorkspaceId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `ws-${timestamp}-${random}`;
  }

  /**
   * 创建工作区目录结构
   */
  private async createWorkspaceStructure(
    workspacePath: string,
    options: CreateWorkspaceOptions
  ): Promise<void> {
    const structure = this.getWorkspaceStructure(workspacePath);

    // 创建所有必需的目录
    await fs.mkdir(structure.workspaceDir, { recursive: true });
    await fs.mkdir(structure.stateDir, { recursive: true });
    await fs.mkdir(structure.configDir, { recursive: true });
    await fs.mkdir(structure.memoryDir, { recursive: true });
    await fs.mkdir(structure.dailyNotesDir, { recursive: true });

    // 创建 .gitignore 排除 .workspace/ 目录
    const gitignorePath = path.join(workspacePath, '.gitignore');
    await fs.writeFile(gitignorePath, '.workspace/\n', 'utf-8');

    // 如果需要，复制默认配置文件
    if (options.copyDefaultConfig !== false) {
      await this.copyDefaultConfigFiles(structure.configDir);
    }

    // 创建空白记忆文件
    await this.createMemoryFiles(structure);
  }

  /**
   * 复制默认配置文件
   */
  private async copyDefaultConfigFiles(targetDir: string): Promise<void> {
    // 默认配置文件位于项目根目录的 .config/
    const projectConfigDir = path.join(
      process.env.NODE_ENV === 'development'
        ? path.join(__dirname, '../../../..')
        : path.join(app.getAppPath(), '../..'),
      CONFIG_DIR_NAME
    );

    const configFiles = [
      'AGENTS.md',
      'SOUL.md',
      'USER.md',
      'IDENTITY.md',
      'TOOLS.md',
    ];

    for (const file of configFiles) {
      const sourcePath = path.join(projectConfigDir, file);
      const targetPath = path.join(targetDir, file);

      try {
        const content = await fs.readFile(sourcePath, 'utf-8');
        await fs.writeFile(targetPath, content, 'utf-8');
      } catch (err) {
        console.warn(`Failed to copy ${file}:`, err);
        // 创建空文件
        await fs.writeFile(targetPath, `# ${file}\n`, 'utf-8');
      }
    }
  }

  /**
   * 创建记忆文件
   */
  private async createMemoryFiles(structure: WorkspaceStructure): Promise<void> {
    // 长期记忆文件
    const longTermPath = path.join(structure.memoryDir, 'long_term.md');
    try {
      await fs.access(longTermPath);
    } catch {
      await fs.writeFile(
        longTermPath,
        '# 长期记忆\n\n这里是 Agent 的长期记忆存储。\n',
        'utf-8'
      );
    }

    // 今日笔记
    const today = new Date().toISOString().split('T')[0];
    const todayNotePath = path.join(structure.dailyNotesDir, `${today}.md`);
    try {
      await fs.access(todayNotePath);
    } catch {
      await fs.writeFile(
        todayNotePath,
        `# ${today}\n\n## 今日工作\n\n## 明日计划\n\n## 备注\n`,
        'utf-8'
      );
    }
  }

  /**
   * 创建工作区元数据文件
   */
  private async createWorkspaceMetadata(
    workspacePath: string,
    metadata: WorkspaceMetadata
  ): Promise<void> {
    const metadataPath = path.join(workspacePath, '.workspace', 'workspace.json');
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8');
  }

  /**
   * 读取工作区元数据
   */
  async readWorkspaceMetadata(workspacePath: string): Promise<WorkspaceMetadata | null> {
    try {
      const metadataPath = path.join(workspacePath, '.workspace', 'workspace.json');
      const content = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(content) as WorkspaceMetadata;
    } catch {
      return null;
    }
  }

  /**
   * 验证工作区结构
   */
  async validateWorkspace(workspacePath: string): Promise<WorkspaceValidationResult> {
    const result: WorkspaceValidationResult = {
      isValid: true,
      errors: [],
      warnings: [],
      missingFiles: [],
    };

    const structure = this.getWorkspaceStructure(workspacePath);

    // 检查必需目录
    const requiredDirs = [
      structure.workspaceDir,
      structure.stateDir,
      structure.configDir,
      structure.memoryDir,
      structure.dailyNotesDir,
    ];

    for (const dir of requiredDirs) {
      try {
        await fs.access(dir);
      } catch {
        result.errors.push(`Missing directory: ${dir}`);
        result.missingFiles.push(dir);
        result.isValid = false;
      }
    }

    // 检查元数据文件
    const metadataPath = path.join(workspacePath, '.workspace', 'workspace.json');
    try {
      await fs.access(metadataPath);
    } catch {
      result.warnings.push('Missing workspace metadata file');
    }

    // 检查配置文件
    const configFiles = ['AGENTS.md', 'SOUL.md', 'USER.md', 'IDENTITY.md', 'TOOLS.md'];
    for (const file of configFiles) {
      const filePath = path.join(structure.configDir, file);
      try {
        await fs.access(filePath);
      } catch {
        result.warnings.push(`Missing config file: ${file}`);
      }
    }

    return result;
  }

  /**
   * 创建新工作区
   */
  async createWorkspace(options: CreateWorkspaceOptions): Promise<WorkspaceInfo> {
    const workspaceId = this.generateWorkspaceId();
    const workspacePath = options.path || path.join(
      app.getPath('home'),
      `zero-employee-workspace-${workspaceId}`
    );

    // 创建工作区结构
    await this.createWorkspaceStructure(workspacePath, options);

    // 创建元数据
    const metadata: WorkspaceMetadata = {
      id: workspaceId,
      name: options.name,
      description: options.description,
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      agentProfile: options.agentProfile || 'default',
      version: '1.0.0',
    };
    await this.createWorkspaceMetadata(workspacePath, metadata);

    // 添加到工作区列表
    const workspaceInfo: WorkspaceInfo = {
      id: workspaceId,
      name: options.name,
      description: options.description,
      path: workspacePath,
      createdAt: metadata.createdAt,
      lastAccessed: metadata.lastAccessed,
      agentProfile: metadata.agentProfile,
      version: metadata.version,
    };

    const config = this.configStore.store;
    config.recentWorkspaces.push(workspaceInfo);
    this.configStore.set('recentWorkspaces', config.recentWorkspaces);

    return workspaceInfo;
  }

  /**
   * 切换工作区
   */
  async switchWorkspace(
    workspaceId: string,
    options: SwitchWorkspaceOptions = {}
  ): Promise<WorkspaceInfo | null> {
    const config = this.configStore.store;
    const workspace = config.recentWorkspaces.find(ws => ws.id === workspaceId);

    if (!workspace) {
      return null;
    }

    // 验证工作区结构
    if (options.validateStructure !== false) {
      const validation = await this.validateWorkspace(workspace.path);
      if (!validation.isValid) {
        throw new Error(`Invalid workspace structure: ${validation.errors.join(', ')}`);
      }
    }

    // 更新最后访问时间
    workspace.lastAccessed = Date.now();

    // 设置为活跃工作区
    this.configStore.set('activeWorkspaceId', workspaceId);
    this.configStore.set('recentWorkspaces', config.recentWorkspaces);

    this.currentWorkspace = workspace;
    return workspace;
  }

  /**
   * 获取当前工作区
   */
  getCurrentWorkspace(): WorkspaceInfo | null {
    if (this.currentWorkspace) {
      return this.currentWorkspace;
    }

    const config = this.configStore.store;
    if (!config.activeWorkspaceId) {
      return null;
    }

    const workspace = config.recentWorkspaces.find(
      ws => ws.id === config.activeWorkspaceId
    );
    this.currentWorkspace = workspace || null;
    return this.currentWorkspace;
  }

  /**
   * 获取工作区列表
   */
  listWorkspaces(): WorkspaceInfo[] {
    const config = this.configStore.store;
    return config.recentWorkspaces || [];
  }

  /**
   * 删除工作区
   */
  async deleteWorkspace(workspaceId: string, deleteFiles: boolean = false): Promise<boolean> {
    const config = this.configStore.store;
    const index = config.recentWorkspaces.findIndex(ws => ws.id === workspaceId);

    if (index === -1) {
      return false;
    }

    const workspace = config.recentWorkspaces[index];

    // 如果是当前工作区，先切换出去
    if (config.activeWorkspaceId === workspaceId) {
      this.configStore.set('activeWorkspaceId', null);
      this.currentWorkspace = null;
    }

    // 从列表中移除
    config.recentWorkspaces.splice(index, 1);
    this.configStore.set('recentWorkspaces', config.recentWorkspaces);

    // 删除文件
    if (deleteFiles) {
      try {
        await fs.rm(workspace.path, { recursive: true, force: true });
      } catch (err) {
        console.warn('Failed to delete workspace files:', err);
      }
    }

    return true;
  }

  /**
   * 更新工作区元数据
   */
  async updateWorkspace(
    workspaceId: string,
    updates: Partial<Pick<WorkspaceInfo, 'name' | 'description' | 'agentProfile'>>
  ): Promise<WorkspaceInfo | null> {
    const config = this.configStore.store;
    const workspace = config.recentWorkspaces.find(ws => ws.id === workspaceId);

    if (!workspace) {
      return null;
    }

    // 更新列表中的信息
    Object.assign(workspace, updates);

    // 更新元数据文件
    const metadata = await this.readWorkspaceMetadata(workspace.path);
    if (metadata) {
      Object.assign(metadata, updates);
      await this.createWorkspaceMetadata(workspace.path, metadata);
    }

    this.configStore.set('recentWorkspaces', config.recentWorkspaces);
    return workspace;
  }

  /**
   * 设置工作区路径（向后兼容）
   * 将旧的单一路径模式转换为工作区
   */
  async migrateLegacyPath(legacyPath: string): Promise<WorkspaceInfo> {
    // 检查是否已有此路径的工作区
    const existing = this.configStore.store.recentWorkspaces.find(
      ws => ws.path === legacyPath
    );

    if (existing) {
      return existing;
    }

    // 创建新的工作区元数据
    const metadata: WorkspaceMetadata = {
      id: this.generateWorkspaceId(),
      name: path.basename(legacyPath),
      description: '从旧版本迁移的工作区',
      createdAt: Date.now(),
      lastAccessed: Date.now(),
      agentProfile: 'default',
      version: '1.0.0',
    };

    // 确保工作区结构存在
    await this.createWorkspaceStructure(legacyPath, {
      name: metadata.name,
      copyDefaultConfig: false,
    });
    await this.createWorkspaceMetadata(legacyPath, metadata);

    // 添加到列表
    const workspaceInfo: WorkspaceInfo = {
      ...metadata,
      path: legacyPath,
    };

    const config = this.configStore.store;
    config.recentWorkspaces.push(workspaceInfo);
    this.configStore.set('recentWorkspaces', config.recentWorkspaces);

    // 设为活跃工作区
    this.configStore.set('activeWorkspaceId', metadata.id);
    this.currentWorkspace = workspaceInfo;

    return workspaceInfo;
  }

  /**
   * 获取工作区路径（向后兼容）
   */
  getWorkspacePath(): string | null {
    const workspace = this.getCurrentWorkspace();
    return workspace?.path || null;
  }

  /**
   * 设置工作区路径（向后兼容）
   */
  async setWorkspacePath(path: string): Promise<void> {
    await this.migrateLegacyPath(path);
  }
}

// 单例
let workspaceManagerInstance: WorkspaceManager | null = null;

/**
 * 获取 WorkspaceManager 单例
 */
export function getWorkspaceManager(): WorkspaceManager {
  if (!workspaceManagerInstance) {
    workspaceManagerInstance = new WorkspaceManager();
  }
  return workspaceManagerInstance;
}
