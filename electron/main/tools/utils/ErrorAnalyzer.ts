/**
 * 错误分析器
 * 分析错误输出并生成修复建议
 */

import { getCallTracker } from '../tracker/CallTracker';

interface ErrorPattern {
  pattern: RegExp;
  suggestion: string | ((match: RegExpMatchArray, command: string) => string);
}

/**
 * 错误模式定义
 */
const ERROR_PATTERNS: ErrorPattern[] = [
  {
    pattern: /not recognized as an internal or external command/i,
    suggestion: (match, cmd) => {
      const cmdName = cmd.split(/\s+/)[0];
      return `命令 "${cmdName}" 不存在。可能是跨平台命令，请尝试使用 Windows 对应命令（如 copy 代替 cp）。`;
    }
  },
  {
    pattern: /cannot find the (path|file) specified/i,
    suggestion: '路径不存在。请检查路径是否正确，或使用绝对路径。'
  },
  {
    pattern: /系统找不到指定的路径/,
    suggestion: '路径不存在。请检查路径是否正确，或使用绝对路径。'
  },
  {
    pattern: /access is denied|拒绝访问/i,
    suggestion: '权限不足。请检查文件权限或以管理员身份运行。'
  },
  {
    pattern: /command line too long|命令行太长/i,
    suggestion: '命令过长。工具已自动切换为响应文件执行。'
  },
  {
    pattern: /no such file or directory/i,
    suggestion: '文件或目录不存在。请检查路径是否正确。'
  },
  {
    pattern: /permission denied/i,
    suggestion: '权限不足。请检查文件权限。'
  },
  {
    pattern: /syntax error/i,
    suggestion: '命令语法错误。请检查命令格式是否正确。'
  },
  {
    pattern: /\.exe is not recognized/i,
    suggestion: '可执行文件未找到。请检查程序是否已安装并添加到 PATH。'
  },
  {
    pattern: /ENOENT|no such file or directory/i,
    suggestion: '文件或目录不存在。请检查路径是否正确。'
  },
];

/**
 * 无限循环模式
 */
const LOOP_PATTERNS: { pattern: RegExp; message: string }[] = [
  {
    pattern: /\bwhile\s+true\b/i,
    message: '检测到无限循环，请确保有退出条件。',
  },
  {
    pattern: /\bfor\s*\(\s*;\s*;\s*\)/i,
    message: '检测到无限循环，请确保有退出条件。',
  },
  {
    pattern: /\bwhile\s*:\s*$/im,
    message: '检测到 Python 无限循环，请确保有退出条件。',
  },
];

export interface AnalyzeOptions {
  cwd?: string;
  wasTimeout?: boolean;
}

export class ErrorAnalyzer {
  /**
   * 分析错误并生成建议
   */
  analyze(
    stderr: string,
    command: string,
    exitCode: number,
    options: AnalyzeOptions = {}
  ): string[] {
    const suggestions: string[] = [];

    // 1. 检查重复执行
    const repeatWarning = getCallTracker().getRepeatWarning(command);
    if (repeatWarning) {
      suggestions.push(repeatWarning);
    }

    // 2. 超时建议
    if (options.wasTimeout) {
      suggestions.push('命令执行超时。建议增加 timeout 参数，或拆分任务为多个小命令。');
    }

    // 3. 错误模式匹配
    for (const { pattern, suggestion } of ERROR_PATTERNS) {
      const match = stderr.match(pattern);
      if (match) {
        if (typeof suggestion === 'function') {
          suggestions.push(suggestion(match, command));
        } else {
          suggestions.push(suggestion);
        }
      }
    }

    // 4. 路径补全建议（如果路径不存在）
    if (/cannot find|找不到|no such file/.test(stderr)) {
      suggestions.push(`当前工作目录: ${options.cwd || process.cwd()}`);
    }

    // 5. 检查无限循环（只是警告，不阻止执行）
    for (const { pattern, message } of LOOP_PATTERNS) {
      if (pattern.test(command)) {
        suggestions.push(message);
      }
    }

    // 6. 如果没有匹配到任何模式，给出通用建议
    if (suggestions.length === 0 && exitCode !== 0) {
      suggestions.push('命令执行失败，请检查命令语法和参数。');
    }

    return suggestions;
  }

  /**
   * 快速检查命令是否包含无限循环
   */
  hasInfiniteLoop(command: string): boolean {
    for (const { pattern } of LOOP_PATTERNS) {
      if (pattern.test(command)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 获取无限循环警告
   */
  getLoopWarning(command: string): string | null {
    for (const { pattern, message } of LOOP_PATTERNS) {
      if (pattern.test(command)) {
        return message;
      }
    }
    return null;
  }
}
