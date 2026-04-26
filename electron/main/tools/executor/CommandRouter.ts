/**
 * 命令路由器
 * 根据命令特征选择最优执行方式
 */

import { getCommandParser } from '../parser/CommandParser';
import { getCrossPlatformMapper } from '../adapter/CrossPlatformMapper';
import { DirectExecutor } from './DirectExecutor';
import { PowerShellExecutor } from './PowerShellExecutor';
import { ResponseFileExecutor } from './ResponseFileExecutor';
import { ExecuteOptions, InternalExecuteResult } from '../types';

/** 命令行长度阈值，超过此值使用响应文件 */
const CMD_LENGTH_THRESHOLD = 8000;

export class CommandRouter {
  private parser = getCommandParser();
  private mapper = getCrossPlatformMapper();
  private directExecutor = new DirectExecutor();
  private powershellExecutor = new PowerShellExecutor();
  private responseFileExecutor = new ResponseFileExecutor();

  /**
   * 执行命令
   * 自动选择最优执行方式
   */
  async execute(command: string, options: ExecuteOptions): Promise<InternalExecuteResult> {
    const { cwd, timeout, env } = options;

    // 1. 跨平台映射
    const mappedCommand = this.mapper.map(command);

    // 2. 检查命令长度
    if (mappedCommand.length > CMD_LENGTH_THRESHOLD) {
      return this.responseFileExecutor.execute(mappedCommand, options);
    }

    // 3. 解析命令
    const parsed = this.parser.parse(mappedCommand);

    // 4. 根据复杂度选择执行方式
    if (parsed.complexity === 'complex') {
      // 复杂命令使用 PowerShell
      return this.powershellExecutor.execute(mappedCommand, options);
    }

    if (parsed.complexity === 'medium') {
      // 中等复杂度：检查是否是 cd && command 模式
      const cdMatch = mappedCommand.match(/^cd\s+(\S+)\s*&&\s+(.+)$/i);
      if (cdMatch) {
        const targetDir = cdMatch[1];
        const subCommand = cdMatch[2];
        const newCwd = this.resolveCwd(cwd, targetDir);

        // 重新解析子命令
        const subParsed = this.parser.parse(subCommand);
        if (subParsed.complexity === 'simple') {
          return this.directExecutor.execute(subParsed.command, subParsed.args, {
            ...options,
            cwd: newCwd,
          });
        }

        // 子命令仍然复杂，使用 PowerShell
        return this.powershellExecutor.execute(subCommand, {
          ...options,
          cwd: newCwd,
        });
      }

      // 其他中等复杂度命令使用 PowerShell
      return this.powershellExecutor.execute(mappedCommand, options);
    }

    // 5. 简单命令：直接执行
    return this.directExecutor.execute(parsed.command, parsed.args, options);
  }

  /**
   * 解析工作目录
   */
  private resolveCwd(cwd: string | undefined, targetDir: string): string {
    const path = require('path');

    if (!cwd) {
      cwd = process.cwd();
    }

    // 处理相对路径和绝对路径
    if (path.isAbsolute(targetDir)) {
      return targetDir;
    }

    return path.resolve(cwd, targetDir);
  }
}
