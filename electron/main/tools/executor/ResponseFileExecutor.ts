/**
 * 响应文件执行器
 * 用于执行超长命令（>8000 字符）
 * 通过临时脚本文件绕过命令行长度限制
 */

import { spawn } from 'child_process';
import { app } from 'electron';
import * as path from 'path';
import { ExecuteOptions, InternalExecuteResult } from '../types';
import { getTempFileManager } from '../utils/TempFileManager';

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

export class ResponseFileExecutor {
  /**
   * 使用响应文件执行超长命令
   */
  async execute(command: string, options: ExecuteOptions): Promise<InternalExecuteResult> {
    const { cwd, timeout = 30000, env } = options;

    // 创建临时脚本文件
    const tempFileManager = getTempFileManager();
    const tempFile = process.platform === 'win32'
      ? tempFileManager.createBatchScript(command)
      : tempFileManager.createScript(`#!/bin/bash\n${command}`, { extension: '.sh' });

    return new Promise((resolve) => {
      let killed = false;
      let stdout = '';
      let stderr = '';
      let wasTimeout = false;

      // 构建环境变量
      const pythonDir = getPythonDir();
      const pathSeparator = process.platform === 'win32' ? ';' : ':';
      const newPATH = `${pythonDir}${pathSeparator}${process.env.PATH || ''}`;

      const enhancedEnv: NodeJS.ProcessEnv = {
        ...process.env,
        PATH: newPATH,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUTF8: '1',
        ...env,
      };
      delete enhancedEnv.PYTHONHOME;
      delete enhancedEnv.PYTHONPATH;

      // 执行临时脚本
      const child = spawn(tempFile.path, [], {
        cwd,
        env: enhancedEnv,
        windowsHide: true,
        shell: true,
      });

      // 设置超时
      const timer = setTimeout(() => {
        killed = true;
        wasTimeout = true;
        child.kill('SIGKILL');
      }, timeout);

      // 收集输出
      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });

      // 处理结果
      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        // 清理临时文件
        tempFile.cleanup();

        resolve({
          stdout,
          stderr,
          exitCode: killed ? -1 : (code ?? -1),
          method: 'responseFile',
          wasTimeout,
        });
      });

      child.on('error', (error: Error) => {
        clearTimeout(timer);
        tempFile.cleanup();

        resolve({
          stdout,
          stderr: error.message,
          exitCode: -1,
          method: 'responseFile',
          wasTimeout: false,
        });
      });
    });
  }
}
