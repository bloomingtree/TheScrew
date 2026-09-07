/**
 * 直接执行器
 * 使用 cross-spawn 直接执行简单命令
 */

import { spawn } from 'child_process';
import crossSpawn from 'cross-spawn';
import { app } from 'electron';
import * as path from 'path';
import { ExecuteOptions, InternalExecuteResult } from '../types';
import { killProcessTree } from './killTree';

/**
 * 获取应用根路径
 */
function getAppRootPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.resolve(__dirname, '../../..');
  }
  return process.resourcesPath || app.getPath('userData');
}

/**
 * 获取 Python 目录
 */
function getPythonDir(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.join(getAppRootPath(), 'electron', 'main', 'python', 'python-3.8.10-embed-amd64');
  }
  return path.join(process.resourcesPath || app.getPath('userData'), 'python', 'python-3.8.10-embed-amd64');
}

export class DirectExecutor {
  /**
   * 直接执行命令
   * 使用 cross-spawn 处理跨平台兼容性
   */
  async execute(
    command: string,
    args: string[],
    options: ExecuteOptions
  ): Promise<InternalExecuteResult> {
    const { cwd, timeout = 30000, env } = options;
    const startTime = Date.now();

    return new Promise((resolve) => {
      const enhancedEnv = this.buildEnv(env);
      let killed = false;
      let stdout = '';
      let stderr = '';
      let wasTimeout = false;

      // 使用 cross-spawn 执行
      // cross-spawn 会自动处理 Windows 上的 .cmd/.exe 和参数转义
      const child = crossSpawn(command, args, {
        cwd,
        env: enhancedEnv,
        windowsHide: true,
      });

      // 设置超时
      const timer = setTimeout(() => {
        killed = true;
        wasTimeout = true;
        killProcessTree(child);
      }, timeout);

      // 收集输出
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });

      // 处理结果
      child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: killed ? -1 : (code ?? -1),
          method: 'direct',
          wasTimeout,
        });
      });

      child.on('error', (error: Error) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: error.message,
          exitCode: -1,
          method: 'direct',
          wasTimeout: false,
        });
      });
    });
  }

  /**
   * 构建环境变量
   */
  private buildEnv(extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const pythonDir = getPythonDir();
    const newPATH = `${pythonDir}${pathSeparator}${process.env.PATH || ''}`;

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: newPATH,
      // Python 编码设置
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      ...(extraEnv || {}),
    };

    // 移除可能干扰嵌入式 Python 的变量
    delete env.PYTHONHOME;
    delete env.PYTHONPATH;

    return env;
  }
}
