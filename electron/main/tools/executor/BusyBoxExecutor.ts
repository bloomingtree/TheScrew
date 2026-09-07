/**
 * BusyBox 执行器
 *
 * 使用内置 busybox-w32（busybox.exe）执行 Unix 命令，
 * 提供 POSIX 兼容环境给 AI Agent 使用（ls/cat/grep/sed/awk + sh 操作符）。
 *
 * === 关键技术决策 ===
 *
 * ## 决策 1：用文件方式传命令（不用 sh -c）
 *
 * 直接 `sh -c "command"` 在 Windows 上有致命问题：
 * Windows 把 argv 按 ANSI 代码页（中文系统是 GBK）解码给 busybox，
 * 导致命令里的中文字符串（如 `grep "螺丝钉"`）被解释成 GBK 字节。
 * 而 UTF-8 文件内容是 UTF-8 字节 → 匹配失败。
 *
 * 解决：把命令写入 UTF-8 编码的临时 .sh 文件，调用 `busybox.exe sh script.sh`。
 * busybox 读文件时按字节读取，UTF-8 字节被原样保留，匹配 UTF-8 文件内容时完美工作。
 *
 * ## 决策 2：输出智能解码
 *
 * busybox-w32 的 stdout 输出编码跟随系统 ANSI 代码页
 * （中文 Windows 默认 GBK）。我们用 Buffer 收集原始字节，
 * 智能解码：先试 UTF-8（处理文件透传），有 U+FFFD 回退到系统编码（GBK）。
 *
 * === 实测覆盖（Win11 中文系统）===
 *   ✅ echo "测试中文" → 正确（GBK 输出，解码为 UTF-8）
 *   ✅ cat utf8-file.txt → 正确（UTF-8 字节透传）
 *   ✅ grep "中文" utf8.md → 正确（模式与内容都是 UTF-8 字节）
 *   ✅ sed "s/中文/X/g" utf8.md → 正确
 *   ✅ echo "你好" | grep "你" → 正确（管道两端都是 UTF-8 字节）
 *   ✅ ls / pwd / date / 重定向 / 命令替换 / for 循环 → 全部正常
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { app } from 'electron';
import crossSpawn from 'cross-spawn';
import { ExecuteOptions, InternalExecuteResult } from '../types';
import { getPathManager } from '../../config/PathManager';
import { killProcessTree } from './killTree';

/**
 * 检测系统 ANSI 代码页对应的编码名（供 TextDecoder 使用）
 *
 * 用 Electron app.getLocale() 推断，覆盖最常见的中文/日文/韩文系统。
 * 其他系统默认 UTF-8。
 */
function getSystemEncoding(): string {
  if (process.platform !== 'win32') return 'utf-8';

  let locale: string;
  try {
    locale = app.getLocale() || '';
  } catch {
    locale = process.env.LANG || process.env.LC_ALL || process.env.LC_CTYPE || '';
  }

  const lower = locale.toLowerCase();

  if (lower.startsWith('zh-cn') || lower.startsWith('zh-sg') || lower.includes('hans')) return 'gbk';
  if (lower.startsWith('zh-tw') || lower.startsWith('zh-hk') || lower.includes('hant')) return 'big5';
  if (lower.startsWith('zh')) return 'gbk';
  if (lower.startsWith('ja')) return 'shift_jis';
  if (lower.startsWith('ko')) return 'euc-kr';

  return 'utf-8';
}

/**
 * 智能解码字节流
 *
 * 策略：
 *   1. 优先 UTF-8（处理文件透传场景）
 *   2. UTF-8 解码出现 U+FFFD 时，回退到系统编码（GBK 等）
 *   3. 系统编码也解码失败时，返回 UTF-8 结果（包含替换字符）
 */
function smartDecodeBuffer(buffer: Buffer, fallbackEncoding: string): string {
  if (buffer.length === 0) return '';

  let buf = buffer;
  // 跳过 UTF-8 BOM
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    buf = buf.slice(3);
  }

  const utf8Text = buf.toString('utf8');
  if (!utf8Text.includes('\uFFFD')) {
    return utf8Text;
  }

  if (fallbackEncoding !== 'utf-8') {
    try {
      const decoder = new TextDecoder(fallbackEncoding, { fatal: false });
      const decoded = decoder.decode(buf);
      if (!decoded.includes('\uFFFD')) {
        return decoded;
      }
    } catch {
      // TextDecoder 不支持的编码（理论上不会发生）
    }
  }

  return utf8Text;
}

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
 * 获取 Python 目录（注入到 PATH）
 */
function getPythonDir(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.join(getAppRootPath(), 'electron', 'main', 'python', 'python-3.8.10-embed-amd64');
  }
  return path.join(process.resourcesPath || app.getPath('userData'), 'python', 'python-3.8.10-embed-amd64');
}

/**
 * 创建临时脚本文件
 */
function createTempScript(command: string): { path: string; cleanup: () => void } {
  const tmpDir = os.tmpdir();
  const scriptPath = path.join(tmpDir, `bb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sh`);

  // 脚本头：set +e 让错误不立即退出（更接近交互式 shell 行为，
  // 否则 `false && echo hi` 会因 false 失败而中止整个脚本）
  const scriptContent = `#!/bin/sh\nset +e\n${command}\n`;

  fs.writeFileSync(scriptPath, scriptContent, 'utf8');

  return {
    path: scriptPath,
    cleanup: () => {
      try {
        fs.unlinkSync(scriptPath);
      } catch {
        // ignore
      }
    },
  };
}

export class BusyBoxExecutor {
  /**
   * 执行 Unix 命令（通过临时 .sh 脚本文件）
   *
   * @param command 完整命令字符串（可包含管道、重定向、链式操作符、中文）
   * @param options 执行选项
   */
  async execute(command: string, options: ExecuteOptions): Promise<InternalExecuteResult> {
    const { cwd, timeout = 30000, env } = options;

    const pathManager = getPathManager();
    const busyboxPath = pathManager.getBusyBoxPath();

    if (!fs.existsSync(busyboxPath)) {
      throw new Error(`BusyBox not found at ${busyboxPath}`);
    }

    // 关键：把命令写入 UTF-8 临时文件，避免 Windows argv 编码转换
    const script = createTempScript(command);

    // 构建环境变量
    const pythonDir = getPythonDir();
    const busyboxDir = pathManager.getBusyBoxDir();
    const pathSeparator = ';';
    const newPATH = `${busyboxDir}${pathSeparator}${pythonDir}${pathSeparator}${process.env.PATH || ''}`;

    const enhancedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: newPATH,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1',
      LANG: 'C.UTF-8',
      LC_ALL: 'C.UTF-8',
      ...env,
    };
    delete enhancedEnv.PYTHONHOME;
    delete enhancedEnv.PYTHONPATH;

    const fallbackEncoding = getSystemEncoding();

    return new Promise((resolve) => {
      let killed = false;
      let wasTimeout = false;
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      // busybox.exe sh <script.sh>
      const child = crossSpawn(busyboxPath, ['sh', script.path], {
        cwd,
        env: enhancedEnv,
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        killed = true;
        wasTimeout = true;
        try {
          killProcessTree(child);
        } catch {
          // ignore
        }
      }, timeout);

      child.stdout?.on('data', (data: Buffer) => {
        stdoutChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderrChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
      });

      child.on('close', (code: number | null) => {
        clearTimeout(timer);
        script.cleanup();

        resolve({
          stdout: smartDecodeBuffer(Buffer.concat(stdoutChunks), fallbackEncoding),
          stderr: smartDecodeBuffer(Buffer.concat(stderrChunks), fallbackEncoding),
          exitCode: killed ? -1 : (code ?? -1),
          method: 'busybox',
          wasTimeout,
        });
      });

      child.on('error', (error: Error) => {
        clearTimeout(timer);
        script.cleanup();

        const stderrText = smartDecodeBuffer(Buffer.concat(stderrChunks), fallbackEncoding);
        resolve({
          stdout: smartDecodeBuffer(Buffer.concat(stdoutChunks), fallbackEncoding),
          stderr: stderrText ? `${stderrText}\n${error.message}` : error.message,
          exitCode: -1,
          method: 'busybox',
          wasTimeout: false,
        });
      });
    });
  }
}
