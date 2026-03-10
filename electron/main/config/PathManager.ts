/**
 * 统一路径管理器
 * 管理所有配置和数据文件的存储路径
 *
 * 设计原则：
 * 1. 统一存储：所有数据存储在程序目录下的 .config 文件夹中
 * 2. 自动迁移：首次启动时自动迁移 AppData 中的旧数据
 * 3. 跨环境支持：开发和生产环境使用统一的路径逻辑
 */

import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// 配置目录名称常量
export const CONFIG_DIR_NAME = '.config';

/**
 * 路径管理器类
 */
export class PathManager {
  private static instance: PathManager | null = null;

  private appRootPath: string;
  private configPath: string;
  private migrationCompleted: boolean = false;

  private constructor() {
    this.appRootPath = this.getAppRootPath();
    this.configPath = path.join(this.appRootPath, CONFIG_DIR_NAME);
    this.ensureDirectories();
  }

  /**
   * 获取 PathManager 单例
   */
  static getInstance(): PathManager {
    if (!PathManager.instance) {
      PathManager.instance = new PathManager();
    }
    return PathManager.instance;
  }

  /**
   * 获取应用根目录
   * - 开发环境：项目根目录
   * - 生产环境：exe 所在目录
   */
  private getAppRootPath(): string {
    // 生产环境：exe 所在目录
    if (app.isPackaged) {
      return path.dirname(app.getPath('exe'));
    }

    // 开发环境：使用 app.getAppPath() 获取项目根目录
    // 这比 __dirname 更可靠，因为 __dirname 可能指向编译后的缓存目录
    try {
      return app.getAppPath();
    } catch {
      // 如果 app.getAppPath() 失败，回退到 __dirname
      // __dirname 指向 dist-electron/main/config/
      // 需要回溯到项目根目录
      return path.resolve(__dirname, '../../..');
    }
  }

  /**
   * 确保所有必要的目录存在
   */
  private ensureDirectories(): void {
    const dirs = [
      this.configPath,
      this.getDataPath(),
      this.getSkillsPath(),
      this.getCredentialsPath(),
      this.getMemoryPath(),
      this.getSchedulerPath(),
      this.getAttachmentsPath(),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  // ==================== 路径获取方法 ====================

  /**
   * 获取应用根目录
   */
  getAppRoot(): string {
    return this.appRootPath;
  }

  /**
   * 获取配置目录根路径 (.config/)
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * 获取运行时数据目录 (.config/data/)
   */
  getDataPath(): string {
    return path.join(this.configPath, 'data');
  }

  /**
   * 获取技能目录 (.config/skills/)
   */
  getSkillsPath(): string {
    return path.join(this.configPath, 'skills');
  }

  /**
   * 获取 Agent 配置目录 (.config/agents/)
   */
  getAgentsPath(): string {
    return path.join(this.configPath, 'agents');
  }

  /**
   * 获取凭证存储目录 (.config/credentials/)
   */
  getCredentialsPath(): string {
    return path.join(this.configPath, 'credentials');
  }

  /**
   * 获取记忆系统目录 (.config/memory/)
   */
  getMemoryPath(): string {
    return path.join(this.configPath, 'memory');
  }

  /**
   * 获取定时任务目录 (.config/data/scheduler/)
   */
  getSchedulerPath(): string {
    return path.join(this.configPath, 'data', 'scheduler');
  }

  /**
   * 获取附件存储目录 (.config/data/attachments/)
   */
  getAttachmentsPath(): string {
    return path.join(this.configPath, 'data', 'attachments');
  }

  /**
   * 获取对话历史文件路径
   */
  getConversationsPath(): string {
    return path.join(this.getDataPath(), 'conversations.json');
  }

  /**
   * 获取工作区列表文件路径
   */
  getWorkspacesPath(): string {
    return path.join(this.getDataPath(), 'workspaces.json');
  }

  /**
   * 获取定时任务文件路径
   */
  getSchedulerJobsPath(): string {
    return path.join(this.getSchedulerPath(), 'jobs.json');
  }

  /**
   * 获取应用配置文件路径
   */
  getAppConfigPath(): string {
    return path.join(this.configPath, 'config.json');
  }

  /**
   * 获取身份配置文件路径
   */
  getIdentityPath(): string {
    return path.join(this.configPath, 'IDENTITY.md');
  }

  /**
   * 获取个性配置文件路径
   */
  getSoulPath(): string {
    return path.join(this.configPath, 'SOUL.md');
  }

  /**
   * 获取用户偏好文件路径
   */
  getUserPath(): string {
    return path.join(this.configPath, 'USER.md');
  }

  /**
   * 获取工具指南文件路径
   */
  getToolsPath(): string {
    return path.join(this.configPath, 'TOOLS.md');
  }

  /**
   * 获取 Agent 列表文件路径
   */
  getAgentsListPath(): string {
    return path.join(this.configPath, 'AGENTS.md');
  }

  // ==================== 数据迁移 ====================

  /**
   * 从旧位置迁移数据到新位置
   * 首次启动时自动调用
   */
  async migrateFromAppData(): Promise<void> {
    if (this.migrationCompleted) {
      return;
    }

    const oldUserDataPath = app.getPath('userData');

    // 检查是否需要迁移（旧位置有数据，新位置没有）
    const oldConversationsPath = path.join(oldUserDataPath, 'conversations.json');
    const newConversationsPath = this.getConversationsPath();

    // 如果新位置已有数据，跳过迁移
    if (fs.existsSync(newConversationsPath)) {
      this.migrationCompleted = true;
      return;
    }

    console.log('[PathManager] 开始迁移数据从 AppData 到程序目录...');

    try {
      // 迁移对话历史
      await this.migrateFile(
        oldConversationsPath,
        newConversationsPath
      );

      // 迁移工作区列表
      await this.migrateFile(
        path.join(oldUserDataPath, 'workspaces.json'),
        this.getWorkspacesPath()
      );

      // 迁移凭证目录
      await this.migrateDirectory(
        path.join(oldUserDataPath, 'credentials'),
        this.getCredentialsPath()
      );

      // 迁移记忆系统
      await this.migrateDirectory(
        path.join(oldUserDataPath, 'memory'),
        this.getMemoryPath()
      );

      // 迁移定时任务
      await this.migrateFile(
        path.join(oldUserDataPath, 'scheduler', 'jobs.json'),
        this.getSchedulerJobsPath()
      );

      // 迁移附件
      await this.migrateDirectory(
        path.join(oldUserDataPath, 'attachments'),
        this.getAttachmentsPath()
      );

      console.log('[PathManager] 数据迁移完成');

      // 创建迁移标记文件
      const migrationMarkerPath = path.join(this.configPath, '.migrated');
      fs.writeFileSync(migrationMarkerPath, new Date().toISOString());

    } catch (err) {
      console.error('[PathManager] 数据迁移失败:', err);
    }

    this.migrationCompleted = true;
  }

  /**
   * 迁移单个文件
   */
  private async migrateFile(oldPath: string, newPath: string): Promise<void> {
    if (!fs.existsSync(oldPath)) {
      return;
    }

    // 确保目标目录存在
    const targetDir = path.dirname(newPath);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 复制文件（不删除原文件，以防回滚）
    await fs.promises.copyFile(oldPath, newPath);
    console.log(`[PathManager] 迁移文件: ${oldPath} -> ${newPath}`);
  }

  /**
   * 迁移整个目录
   */
  private async migrateDirectory(oldPath: string, newPath: string): Promise<void> {
    if (!fs.existsSync(oldPath)) {
      return;
    }

    // 确保目标目录存在
    if (!fs.existsSync(newPath)) {
      fs.mkdirSync(newPath, { recursive: true });
    }

    // 递归复制目录
    const entries = await fs.promises.readdir(oldPath, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(oldPath, entry.name);
      const destPath = path.join(newPath, entry.name);

      if (entry.isDirectory()) {
        await this.migrateDirectory(srcPath, destPath);
      } else {
        await fs.promises.copyFile(srcPath, destPath);
      }
    }

    console.log(`[PathManager] 迁移目录: ${oldPath} -> ${newPath}`);
  }

  /**
   * 检查是否已完成迁移
   */
  isMigrationCompleted(): boolean {
    if (this.migrationCompleted) {
      return true;
    }
    // 检查迁移标记文件
    const migrationMarkerPath = path.join(this.configPath, '.migrated');
    return fs.existsSync(migrationMarkerPath);
  }
}

/**
 * 获取 PathManager 单例（便捷函数）
 */
export function getPathManager(): PathManager {
  return PathManager.getInstance();
}

/**
 * 获取配置目录名称常量（便捷函数）
 */
export function getConfigDirName(): string {
  return CONFIG_DIR_NAME;
}
