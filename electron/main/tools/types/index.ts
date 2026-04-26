/**
 * Bash 工具类型定义
 */

/**
 * 执行结果
 */
export interface ExecuteResult {
  /** 是否成功（退出码 === 0） */
  success: boolean;
  /** 标准输出 */
  stdout: string;
  /** 标准错误 */
  stderr: string;
  /** 进程退出码 */
  exitCode: number;
  /** 使用的执行方式 */
  executionMethod: 'direct' | 'powershell' | 'cmd' | 'responseFile';
  /** 修复建议（失败时提供） */
  suggestions?: string[];
  /** 是否需要用户确认（危险命令） */
  requiresConfirmation?: boolean;
  /** 警告级别 */
  warningLevel?: 'none' | 'caution' | 'danger';
  /** 重复执行次数（同一命令在 60 秒内） */
  repeatCount?: number;
}

/**
 * 执行选项
 */
export interface ExecuteOptions {
  /** 工作目录 */
  cwd?: string;
  /** 环境变量 */
  env?: NodeJS.ProcessEnv;
  /** 超时时间（毫秒），默认 30000 */
  timeout?: number;
  /** 跳过确认（已确认过） */
  skipConfirmation?: boolean;
}

/**
 * 命令验证结果
 */
export interface ValidationResult {
  /** 是否有效（danger 级别为 false） */
  valid: boolean;
  /** 是否需要用户确认 */
  requiresConfirmation: boolean;
  /** 警告信息 */
  warnings: string[];
  /** 危险级别 */
  dangerLevel: 'none' | 'caution' | 'danger';
}

/**
 * 命令复杂度
 */
export type Complexity = 'simple' | 'medium' | 'complex';

/**
 * 解析后的命令
 */
export interface ParsedCommand {
  /** 命令名 */
  command: string;
  /** 参数列表 */
  args: string[];
  /** 原始命令字符串 */
  raw: string;
  /** 是否为复杂命令 */
  isComplex: boolean;
  /** 复杂度级别 */
  complexity: Complexity;
}

/**
 * 内部执行结果（执行器返回）
 */
export interface InternalExecuteResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  method: 'direct' | 'powershell' | 'cmd' | 'responseFile';
  wasTimeout?: boolean;
}

/**
 * 临时文件信息
 */
export interface TempFileInfo {
  /** 文件路径 */
  path: string;
  /** 清理函数 */
  cleanup: () => void;
}
