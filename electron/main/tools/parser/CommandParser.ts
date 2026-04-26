/**
 * 命令解析器
 * 使用状态机解析命令字符串，支持单引号、双引号、转义符
 */

import { ParsedCommand, Complexity } from '../types';

type ParseState = 'normal' | 'singleQuote' | 'doubleQuote';

export class CommandParser {
  /**
   * 解析命令字符串
   */
  parse(command: string): ParsedCommand {
    const trimmed = command.trim();
    const tokens = this.tokenize(trimmed);
    const complexity = this.detectComplexity(trimmed);

    return {
      command: tokens[0] || '',
      args: tokens.slice(1),
      raw: trimmed,
      isComplex: complexity !== 'simple',
      complexity,
    };
  }

  /**
   * 使用状态机分割命令为 tokens
   * 支持：单引号（字面量）、双引号（可转义）、反斜杠转义
   */
  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let state: ParseState = 'normal';
    let i = 0;

    while (i < input.length) {
      const char = input[i];

      switch (state) {
        case 'normal':
          if (char === ' ' || char === '\t') {
            // 空白分割
            if (current) {
              tokens.push(current);
              current = '';
            }
            i++;
          } else if (char === "'") {
            // 进入单引号模式
            state = 'singleQuote';
            i++;
          } else if (char === '"') {
            // 进入双引号模式
            state = 'doubleQuote';
            i++;
          } else if (char === '\\' && i + 1 < input.length) {
            // 转义下一个字符
            current += input[i + 1];
            i += 2;
          } else {
            current += char;
            i++;
          }
          break;

        case 'singleQuote':
          // 单引号内：所有字符都是字面量，直到遇到闭合的单引号
          if (char === "'") {
            state = 'normal';
            i++;
          } else {
            current += char;
            i++;
          }
          break;

        case 'doubleQuote':
          // 双引号内：支持转义
          if (char === '"') {
            state = 'normal';
            i++;
          } else if (char === '\\' && i + 1 < input.length) {
            // 转义序列
            const next = input[i + 1];
            if (next === '"' || next === '\\' || next === '$' || next === '`') {
              current += next;
              i += 2;
            } else {
              // 其他情况保留反斜杠
              current += char;
              i++;
            }
          } else {
            current += char;
            i++;
          }
          break;
      }
    }

    // 添加最后一个 token
    if (current) {
      tokens.push(current);
    }

    return tokens;
  }

  /**
   * 检测命令复杂度
   */
  private detectComplexity(cmd: string): Complexity {
    // 检测复杂命令特征
    const complexPatterns = [
      /&&/,       // 与操作符
      /\|\|/,     // 或操作符
      /\|[^|]/,   // 管道（非 ||）
      /;/,        // 命令分隔
      />/,        // 输出重定向
      /</,        // 输入重定向
      /\$\(/,     // 命令替换
      /`[^`]+`/,  // 反引号命令替换
    ];

    // 检查是否在引号内
    for (const pattern of complexPatterns) {
      if (pattern.test(cmd)) {
        // 简单检查：如果操作符在引号外，则为复杂命令
        if (this.isOperatorOutsideQuotes(cmd, pattern.source)) {
          // cd dir && command 是中等复杂度
          if (/^cd\s+\S+\s*&&\s+/.test(cmd)) {
            return 'medium';
          }
          return 'complex';
        }
      }
    }

    // 命令行长度检查
    if (cmd.length > 8000) {
      return 'complex';
    }

    return 'simple';
  }

  /**
   * 检查操作符是否在引号外
   * 简化实现：通过计数引号来判断
   */
  private isOperatorOutsideQuotes(cmd: string, operatorPattern: string): boolean {
    let inSingleQuote = false;
    let inDoubleQuote = false;
    let i = 0;

    while (i < cmd.length) {
      const char = cmd[i];

      if (char === '\\' && i + 1 < cmd.length) {
        // 跳过转义字符
        i += 2;
        continue;
      }

      if (char === "'" && !inDoubleQuote) {
        inSingleQuote = !inSingleQuote;
      } else if (char === '"' && !inSingleQuote) {
        inDoubleQuote = !inDoubleQuote;
      }

      // 检查操作符
      if (!inSingleQuote && !inDoubleQuote) {
        const remaining = cmd.slice(i);
        if (new RegExp('^' + operatorPattern).test(remaining)) {
          return true;
        }
      }

      i++;
    }

    return false;
  }

  /**
   * 检查命令是否为 Python 命令
   */
  isPythonCommand(command: string): boolean {
    const lower = command.toLowerCase();
    return (
      lower === 'python' ||
      lower === 'python.exe' ||
      lower === 'python3' ||
      lower === 'py'
    );
  }

  /**
   * 提取 Python -c 命令中的代码
   * 返回 null 如果不是 python -c 命令
   */
  extractPythonInlineCode(command: string): string | null {
    const match = command.match(/^python(?:\.exe|3)?\s+-c\s+["'](.+)["']\s*$/i);
    if (match) {
      return match[1];
    }

    // 尝试解析更复杂的 python -c 命令
    const parsed = this.parse(command);
    if (this.isPythonCommand(parsed.command) && parsed.args[0] === '-c') {
      // 合并剩余参数作为代码
      return parsed.args.slice(1).join(' ');
    }

    return null;
  }
}

// 单例
let parserInstance: CommandParser | null = null;

export function getCommandParser(): CommandParser {
  if (!parserInstance) {
    parserInstance = new CommandParser();
  }
  return parserInstance;
}
