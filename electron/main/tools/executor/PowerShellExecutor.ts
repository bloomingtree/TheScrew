/**
 * PowerShell 执行器
 * 使用 -EncodedCommand 执行复杂命令
 * 完全避免引号解析问题
 */

import { spawn } from 'child_process';
import crossSpawn from 'cross-spawn';
import { app } from 'electron';
import * as path from 'path';
import { ExecuteOptions, InternalExecuteResult } from '../types';

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

export class PowerShellExecutor {
  /**
   * 使用 PowerShell 的 -EncodedCommand 执行复杂命令
   * 完全避免引号解析问题
   */
  async execute(command: string, options: ExecuteOptions): Promise<InternalExecuteResult> {
    const { cwd, timeout = 30000, env } = options;

    // 非 Windows 平台回退到直接执行
    if (process.platform !== 'win32') {
      return this.executeWithBash(command, options);
    }

    // 包装命令：强制 UTF-8 编码（关键修复）
    //
    // 为什么不能用 `chcp 65001 >nul && ${command}`：
    //   1. PowerShell 5.1（Windows 自带）不支持 `&&` 操作符，会报语法错误
    //   2. 即使能用，chcp 只切 Win32 console 代码页，不会同步 PowerShell 的
    //      `[Console]::OutputEncoding`（.NET 层，PowerShell 的 Write-Output 等用这个）
    //
    // 正确做法：用 PowerShell 语法（分号分隔）显式设置三层编码
    //   - [Console]::OutputEncoding：控制 PowerShell 写入 stdout 时的字节编码
    //   - $OutputEncoding：控制 PowerShell 通过管道发送给子进程时的编码
    //   - chcp 65001：让被调用的原生 exe（如 ping、systeminfo）也输出 UTF-8
    const wrappedCommand = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      '$OutputEncoding = [System.Text.Encoding]::UTF8',
      'chcp 65001 > $null',
      command,
    ].join('; ');

    // 将命令转换为 UTF-16LE 并 Base64 编码
    const encodedCommand = Buffer.from(wrappedCommand, 'utf16le').toString('base64');

    return new Promise((resolve) => {
      let killed = false;
      let stdout = '';
      let stderr = '';
      let wasTimeout = false;

      // PowerShell 参数
      const psArgs = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', encodedCommand,
      ];

      // 构建环境变量
      const pythonDir = getPythonDir();
      const pathSeparator = ';';
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

      // 启动 PowerShell
      // 优先使用 cross-spawn（更好的 Windows 可执行文件解析）
      // 如果失败，回退到完整路径
      const systemRoot = process.env.SystemRoot || 'C:\\Windows';
      const psFullPath = path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
      const child = crossSpawn(psFullPath, psArgs, {
        cwd,
        env: enhancedEnv,
        windowsHide: true,
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
        resolve({
          stdout,
          stderr,
          exitCode: killed ? -1 : (code ?? -1),
          method: 'powershell',
          wasTimeout,
        });
      });

      child.on('error', (error: Error) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: error.message,
          exitCode: -1,
          method: 'powershell',
          wasTimeout: false,
        });
      });
    });
  }

  /**
   * 非 Windows 平台使用 bash 执行
   */
  private async executeWithBash(command: string, options: ExecuteOptions): Promise<InternalExecuteResult> {
    const { cwd, timeout = 30000, env } = options;

    return new Promise((resolve) => {
      let killed = false;
      let stdout = '';
      let stderr = '';
      let wasTimeout = false;

      const enhancedEnv: NodeJS.ProcessEnv = {
        ...process.env,
        ...env,
      };

      const child = spawn('bash', ['-c', command], {
        cwd,
        env: enhancedEnv,
      });

      const timer = setTimeout(() => {
        killed = true;
        wasTimeout = true;
        child.kill('SIGKILL');
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString('utf8');
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString('utf8');
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr,
          exitCode: killed ? -1 : (code ?? -1),
          method: 'powershell',
          wasTimeout,
        });
      });

      child.on('error', (error: Error) => {
        clearTimeout(timer);
        resolve({
          stdout,
          stderr: error.message,
          exitCode: -1,
          method: 'powershell',
          wasTimeout: false,
        });
      });
    });
  }
}
