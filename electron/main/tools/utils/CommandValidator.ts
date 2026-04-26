/**
 * 命令验证器
 * 检测危险命令，提供安全保护
 */

import { ValidationResult } from '../types';

interface DangerPattern {
  pattern: RegExp;
  level: 'danger' | 'caution';
  message: string;
}

/**
 * 危险命令模式
 */
const DANGER_PATTERNS: DangerPattern[] = [
  // 系统级危险操作
  {
    pattern: /\brm\s+(-[rf]+\s+)*\/\b/i,
    level: 'danger',
    message: '🚫 禁止删除根目录',
  },
  {
    pattern: /\brm\s+(-[rf]+\s+)*\//i,
    level: 'danger',
    message: '🚫 禁止递归强制删除根目录',
  },
  {
    pattern: /\bdel\s+\/[sS]\s+\\/i,
    level: 'danger',
    message: '🚫 禁止递归删除根目录',
  },
  {
    pattern: /\bformat\s+[a-z]:/i,
    level: 'danger',
    message: '🚫 禁止格式化磁盘',
  },
  {
    pattern: /\bdd\s+if=/i,
    level: 'danger',
    message: '🚫 禁止使用 dd 命令',
  },
  {
    pattern: /\bmkfs\./i,
    level: 'danger',
    message: '🚫 禁止格式化文件系统',
  },

  // 谨慎操作（需要确认）
  {
    pattern: /\brm\s+-[rf]+\b/i,
    level: 'caution',
    message: '⚠️ 递归强制删除，请确认路径正确',
  },
  {
    pattern: /\bdel\s+\/[sS]\b/i,
    level: 'caution',
    message: '⚠️ 递归删除，请确认路径正确',
  },
  {
    pattern: /\brmdir\s+\/[sS]\b/i,
    level: 'caution',
    message: '⚠️ 递归删除目录，请确认路径正确',
  },
  {
    pattern: /\bmv\s+\S+\s+\/dev\/null\b/i,
    level: 'caution',
    message: '⚠️ 文件将被永久删除',
  },
  {
    pattern: /\btruncate\s+-s\s+0\b/i,
    level: 'caution',
    message: '⚠️ 文件将被清空',
  },
];

/**
 * 无限循环模式
 */
const LOOP_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\bwhile\s+true\b/i,
    message: '⚠️ 检测到无限循环，请确保有退出条件',
  },
  {
    pattern: /\bfor\s*\(\s*;\s*;\s*\)/i,
    message: '⚠️ 检测到无限循环，请确保有退出条件',
  },
  {
    pattern: /\bwhile\s*:\s*$/im,
    message: '⚠️ 检测到 Python 无限循环，请确保有退出条件',
  },
];

export class CommandValidator {
  /**
   * 验证命令安全性
   */
  validate(command: string): ValidationResult {
    const warnings: string[] = [];
    let requiresConfirmation = false;
    let dangerLevel: 'none' | 'caution' | 'danger' = 'none';

    // 检查危险命令
    for (const { pattern, level, message } of DANGER_PATTERNS) {
      if (pattern.test(command)) {
        warnings.push(message);
        if (level === 'danger') {
          dangerLevel = 'danger';
          requiresConfirmation = true;
        } else if (level === 'caution' && dangerLevel !== 'danger') {
          dangerLevel = 'caution';
          requiresConfirmation = true;
        }
      }
    }

    // 检查无限循环（只是警告，不阻止执行）
    for (const { pattern, message } of LOOP_PATTERNS) {
      if (pattern.test(command)) {
        warnings.push(message);
      }
    }

    return {
      valid: dangerLevel !== 'danger', // danger 级别默认不执行
      requiresConfirmation,
      warnings,
      dangerLevel,
    };
  }

  /**
   * 快速检查命令是否危险
   */
  isDangerous(command: string): boolean {
    for (const { pattern, level } of DANGER_PATTERNS) {
      if (pattern.test(command) && level === 'danger') {
        return true;
      }
    }
    return false;
  }

  /**
   * 快速检查命令是否需要确认
   */
  needsConfirmation(command: string): boolean {
    for (const { pattern } of DANGER_PATTERNS) {
      if (pattern.test(command)) {
        return true;
      }
    }
    return false;
  }
}

// 单例
let validatorInstance: CommandValidator | null = null;

export function getCommandValidator(): CommandValidator {
  if (!validatorInstance) {
    validatorInstance = new CommandValidator();
  }
  return validatorInstance;
}
