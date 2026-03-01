/**
 * 工作区配置类型定义
 * 基于 OpenClaw 的工作区设计理念
 */

/**
 * 工作区信息
 */
export interface WorkspaceInfo {
  /** 工作区唯一标识 */
  id: string;
  /** 工作区名称 */
  name: string;
  /** 工作区描述 */
  description?: string;
  /** 工作区路径 */
  path: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后访问时间 */
  lastAccessed: number;
  /** Agent 配置文件 */
  agentProfile?: string;
  /** 工作区版本 */
  version?: string;
}

/**
 * 工作区元数据（存储在 .workspace/workspace.json）
 */
export interface WorkspaceMetadata {
  /** 工作区唯一标识 */
  id: string;
  /** 工作区名称 */
  name: string;
  /** 工作区描述 */
  description?: string;
  /** 创建时间 */
  createdAt: number;
  /** 最后访问时间 */
  lastAccessed: number;
  /** Agent 配置文件 */
  agentProfile?: string;
  /** 工作区版本 */
  version?: string;
}

/**
 * 全局工作区配置（存储在 config/workspaces.json）
 */
export interface WorkspacesConfig {
  /** 当前活跃的工作区 ID */
  activeWorkspaceId: string | null;
  /** 最近使用的工作区列表 */
  recentWorkspaces: WorkspaceInfo[];
}

/**
 * 工作区创建选项
 */
export interface CreateWorkspaceOptions {
  /** 工作区名称 */
  name: string;
  /** 工作区路径（可选，默认生成） */
  path?: string;
  /** 工作区描述 */
  description?: string;
  /** Agent 配置 */
  agentProfile?: string;
  /** 是否复制默认配置文件 */
  copyDefaultConfig?: boolean;
}

/**
 * 工作区切换选项
 */
export interface SwitchWorkspaceOptions {
  /** 是否迁移当前数据 */
  migrateData?: boolean;
  /** 是否验证工作区结构 */
  validateStructure?: boolean;
}

/**
 * 工作区结构
 */
export interface WorkspaceStructure {
  /** 工作区元数据目录 */
  workspaceDir: string;
  /** 状态数据目录 */
  stateDir: string;
  /** Agent 配置目录 */
  configDir: string;
  /** 记忆目录 */
  memoryDir: string;
  /** 每日笔记目录 */
  dailyNotesDir: string;
}

/**
 * 工作区验证结果
 */
export interface WorkspaceValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 错误信息 */
  errors: string[];
  /** 警告信息 */
  warnings: string[];
  /** 缺失的文件 */
  missingFiles: string[];
}
