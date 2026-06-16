/**
 * 命令路由器
 * 根据命令特征选择最优执行方式
 */

import * as fs from 'fs';
import { getCommandParser } from '../parser/CommandParser';
import { getCrossPlatformMapper } from '../adapter/CrossPlatformMapper';
import { DirectExecutor } from './DirectExecutor';
import { PowerShellExecutor } from './PowerShellExecutor';
import { ResponseFileExecutor } from './ResponseFileExecutor';
import { BusyBoxExecutor } from './BusyBoxExecutor';
import { isBusyBoxApplet, isPowerShellCmdlet, hasShellOperators } from './BusyBoxApplets';
import { getPathManager } from '../../config/PathManager';
import { ExecuteOptions, InternalExecuteResult } from '../types';

/** 命令行长度阈值，超过此值使用响应文件 */
const CMD_LENGTH_THRESHOLD = 8000;

export class CommandRouter {
  private parser = getCommandParser();
  private mapper = getCrossPlatformMapper();
  private directExecutor = new DirectExecutor();
  private powershellExecutor = new PowerShellExecutor();
  private responseFileExecutor = new ResponseFileExecutor();
  private busyBoxExecutor = new BusyBoxExecutor();

  /**
   * 执行命令
   * 自动选择最优执行方式
   */
  async execute(command: string, options: ExecuteOptions): Promise<InternalExecuteResult> {
    const { cwd, timeout, env } = options;

    // 0. BusyBox 优先路由（在跨平台映射之前）
    // 关键：Unix 命令（ls/cat/grep/...）和带操作符的命令优先走 BusyBox，
    // 避免 CrossPlatformMapper 把 ls 错误映射成 dir（损失参数和功能）。
    try {
      const bbPath = getPathManager().getBusyBoxPath();
      if (fs.existsSync(bbPath)) {
        // 0.1 命令首词是 BusyBox applet → 直接走 BusyBox
        const firstToken = this.parser.parse(command).command;
        if (firstToken && isBusyBoxApplet(firstToken)) {
          return await this.busyBoxExecutor.execute(command, options);
        }

        // 0.2 命令包含 shell 操作符（管道/重定向/链式）且非 PowerShell cmdlet
        //     → 走 BusyBox sh -c（POSIX 兼容，远胜 PowerShell 5.1）
        if (hasShellOperators(command) && !isPowerShellCmdlet(command)) {
          return await this.busyBoxExecutor.execute(command, options);
        }
      }
    } catch (e) {
      // busybox.exe 不存在或其他错误：静默回退到原流程
      console.warn('[CommandRouter] BusyBox routing skipped, fallback to legacy path:', e);
    }

    // 1. 跨平台映射（busybox 缺失时的兜底：ls→dir, cat→type）
    const mappedCommand = this.mapper.map(command);

    // 2. 检查命令长度
    if (mappedCommand.length > CMD_LENGTH_THRESHOLD) {
      return this.responseFileExecutor.execute(mappedCommand, options);
    }

    // 3. 解析命令
    const parsed = this.parser.parse(mappedCommand);

    // 4. 根据复杂度选择执行方式
    if (parsed.complexity === 'complex') {
      // 复杂命令使用 PowerShell（此时 busybox 已尝试过但条件不满足）
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
