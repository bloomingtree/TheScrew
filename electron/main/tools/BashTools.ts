import { spawn } from 'child_process';
import path from 'path';
import { app } from 'electron';
import { Tool } from './ToolManager';
import { getWorkspacePath } from './FileTools';
import { writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';

/**
 * 检测字符串是否包含非 ASCII 字符（如中文、日文、韩文等）
 */
function hasNonAscii(str: string): boolean {
  return /[^\x00-\x7F]/.test(str);
}

/**
 * 从命令中提取 Python 脚本路径和参数
 * 返回 { scriptPath, args, prefix } 或 null
 */
function parsePythonCommand(command: string): { scriptPath: string; args: string[]; prefix: string } | null {
  // 匹配 python 命令模式：python ["script.py" | script.py] [args...]
  // 支持引号包裹的脚本路径
  const pythonRegex = /^(\s*python(?:\.exe)?\s+)(?:"([^"]+\.(?:py|pyw))"|'([^']+\.(?:py|pyw))'|([^\s]+\.(?:py|pyw)))\s*(.*)$/i;
  const match = command.match(pythonRegex);

  if (!match) return null;

  const prefix = match[1]; // "python "
  // 脚本路径可能是三种情况之一：双引号、单引号、无引号
  const scriptPath = match[2] || match[3] || match[4]; // script.py (去除引号)
  const argsStr = match[5]; // 剩余参数

  // 解析参数（处理引号）
  const args: string[] = [];
  if (argsStr) {
    const argRegex = /(?:([^\s"']+)|"([^"]*)"|'([^']*)')/g;
    let argMatch;
    while ((argMatch = argRegex.exec(argsStr)) !== null) {
      args.push(argMatch[1] || argMatch[2] || argMatch[3]);
    }
  }

  return { scriptPath, args, prefix };
}

/**
 * 处理包含非 ASCII 字符的 Python 命令
 * 通过临时文件传递参数，避免编码问题
 */
function wrapPythonCommandWithArgsFile(command: string, pythonDir: string): string {
  const parsed = parsePythonCommand(command);
  if (!parsed) return command;

  const { scriptPath, args, prefix } = parsed;

  // 检查参数是否包含非 ASCII 字符
  const hasNonAsciiArgs = args.some(arg => hasNonAscii(arg));
  if (!hasNonAsciiArgs) return command;

  // 创建临时目录存储参数和 wrapper 脚本
  const tempDir = mkdtempSync(path.join(tmpdir(), 'py-args-'));
  const argsFile = path.join(tempDir, 'args.json');
  const wrapperFile = path.join(tempDir, 'wrapper.py');

  // 将参数写入 JSON 文件（UTF-8 编码）
  const argsJson = JSON.stringify(args);
  writeFileSync(argsFile, argsJson, 'utf-8');

  // 生成 wrapper 代码
  // 关键：设置正确的 __file__ 和 __name__ 变量，确保脚本能正确解析相对导入
  const wrapperCode = `# -*- coding: utf-8 -*-
import sys
import json
import os

# 从临时文件读取参数
_args_file = r'${argsFile.replace(/\\/g, '\\\\')}'
with open(_args_file, 'r', encoding='utf-8') as _f:
    _args = json.load(_f)

# 设置 sys.argv
sys.argv = [r'${scriptPath.replace(/\\/g, '\\\\')}'] + _args

# 清理临时文件
try:
    os.remove(_args_file)
except:
    pass

# 执行原始脚本（设置正确的 __file__ 和 __name__）
_script_path = r'${scriptPath.replace(/\\/g, '\\\\')}'
with open(_script_path, 'r', encoding='utf-8') as _sf:
    _code = _sf.read()

# 创建全局命名空间，设置正确的 __file__ 和 __name__
_globals = {
    '__name__': '__main__',
    '__file__': _script_path,
    '__builtins__': __builtins__,
}
exec(compile(_code, _script_path, 'exec'), _globals)

# 清理 wrapper 文件和目录
try:
    os.remove(__file__)
    os.rmdir(os.path.dirname(__file__))
except:
    pass
`;

  // 将 wrapper 代码写入临时文件
  writeFileSync(wrapperFile, wrapperCode, 'utf-8');

  // 返回新的命令（执行 wrapper 脚本）
  return `python ${wrapperFile}`;
}

/**
 * 获取应用根路径
 * 开发环境: 项目根目录
 * 生产环境: resources 目录
 *
 * 注意: 编译后代码在 dist-electron/main/，
 * 所以需要向上两级 (../..) 到达项目根目录
 */
function getAppRootPath(): string {
  if (process.env.NODE_ENV === 'development') {
    // 编译后: dist-electron/main -> ../.. -> 项目根目录
    return path.resolve(__dirname, '../..');
  }
  return process.resourcesPath || app.getPath('userData');
}

/**
 * 获取项目 Python 目录路径
 * 开发环境: electron/main/python/python-3.8.10-embed-amd64
 * 生产环境: resources/python/python-3.8.10-embed-amd64 (从 asar 外部加载，因为 .pyd 文件需要作为本地文件)
 */
function getPythonDir(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.join(getAppRootPath(), 'electron', 'main', 'python', 'python-3.8.10-embed-amd64');
  }
  // 生产环境：使用 extraResources 复制的 Python 目录
  // .pyd 文件必须作为本地文件存在，不能从 asar 读取
  return path.join(process.resourcesPath || app.getPath('userData'), 'python', 'python-3.8.10-embed-amd64');
}

/**
 * 执行 Bash 命令
 */
async function executeCommand(
  command: string,
  options: {
    cwd?: string;
    timeout?: number;
    env?: Record<string, string>;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const { cwd, timeout = 120000, env = {} } = options;
  const pythonDir = getPythonDir();

  // Windows 上检测并处理包含非 ASCII 字符的 Python 命令
  let processedCommand = command;
  if (process.platform === 'win32' && hasNonAscii(command)) {
    processedCommand = wrapPythonCommandWithArgsFile(command, pythonDir);
  }

  return new Promise((resolve) => {
    // 在 Windows 上使用 cmd.exe
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
    // Windows: 使用 chcp 65001 切换到 UTF-8 代码页
    const actualCommand = process.platform === 'win32'
      ? `chcp 65001 >nul && ${processedCommand}`
      : processedCommand;
    const shellArgs = process.platform === 'win32' ? ['/c', actualCommand] : ['-c', actualCommand];

    // 构建 PATH：项目 Python 目录必须在最前面
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const newPATH = `${pythonDir}${pathSeparator}${process.env.PATH || ''}`;

    // 合并环境变量，确保项目 Python 优先
    // 注意：Windows 嵌入式 Python 使用 python38._pth 文件控制模块搜索路径
    // 不需要设置 PYTHONHOME/PYTHONPATH，这可能会与 _pth 文件冲突
    // PYTHONIOENCODING: 解决 Windows 中文路径编码问题
    const enhancedEnv: Record<string, string> = {
      ...process.env,
      PATH: newPATH,
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1', // Python 3.7+ 强制使用 UTF-8
      ...env,
    };

    // 移除可能干扰嵌入式 Python 的环境变量
    delete enhancedEnv.PYTHONHOME;
    delete enhancedEnv.PYTHONPATH;

    const child = spawn(shell, shellArgs, {
      cwd: cwd || getWorkspacePath() || undefined,
      env: enhancedEnv,
      shell: false,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let killed = false;

    // 设置超时
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeout);

    child.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: killed ? -1 : code,
      });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: error.message,
        exitCode: -1,
      });
    });
  });
}

export const bashTools: Tool[] = [
  {
    name: 'bash',
    description: `Execute shell commands. This is the ONLY tool for running commands like ls, cat, grep, python, npm, git, etc.

**IMPORTANT**: Do NOT use command names (ls, cat, grep, python, etc.) as tool names. Always use bash(command="...") instead.
- WRONG: ls(path="...") or python(script="...")
- CORRECT: bash(command="ls -la /path") or bash(command="python script.py")

**Common Commands**:
- List files: bash(command="ls -la /path")
- Read file: bash(command="cat /path/file.txt")
- Search: bash(command="grep -r 'pattern' /path")
- Python: bash(command="python script.py arg1 arg2")
- Git: bash(command="git status")
- NPM: bash(command="npm install")

**Python Support**:
- Built-in Python 3.8.10 is pre-configured and ready to use
- Use \`python\` or \`python.exe\` directly to run Python code and scripts
- No additional setup required - Python is integrated into the shell environment

**Features**:
- Executes commands in the workspace root directory
- Python commands (\`python\` or \`python.exe\`) automatically use the built-in Python 3.8.10
- Environment variables are preserved and enhanced with Python path
- Default timeout: 120 seconds

**Usage Examples**:
- Simple commands: bash(command="ls -la")
- Python code: bash(command="python -c \\"print('Hello')\\"")
- Python scripts in workspace: bash(command="python script.py arg1 arg2")
- Python scripts with absolute path: bash(command="python C:/path/to/script.py arg1")
- Multiple commands: bash(command="cd src && python test.py")

**Important - Windows Path Handling**:
- Use forward slashes (/) instead of backslashes (\\) in paths
- Correct: python C:/path/to/script.py arg1 arg2
- If path contains spaces, use forward slashes without quotes

**CRITICAL - Non-ASCII Characters (Chinese/Japanese/Korean etc.)**:
- Command-line arguments with non-ASCII characters WILL FAIL due to encoding issues
- SOLUTION: Use relative paths from workspace when possible
- Example of WRONG approach: python script.py "D:/工作/文件.docx"
- Example of CORRECT approach: python script.py "work/file.docx" (relative to workspace)

**Notes**:
- On Windows, commands run via cmd.exe
- For complex operations, consider writing a script first`,
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
        cwd: {
          type: 'string',
          description: 'Working directory (optional, defaults to workspace root)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (optional, defaults to 120000)',
        },
      },
      required: ['command'],
    },
    handler: async ({ command, cwd, timeout }) => {
      try {
        const workspacePath = getWorkspacePath();
        if (!workspacePath && !cwd) {
          return {
            success: false,
            error: '工作空间未设置，请先让用户设置工作空间或指定 cwd 参数',
          };
        }

        const result = await executeCommand(command, {
          cwd: cwd || workspacePath,
          timeout,
        });

        const response: any = {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: result.stdout.trim(),
          stderr: result.stderr.trim(),
        };

        if (result.exitCode !== 0) {
          response.error = `Command exited with code ${result.exitCode}`;
        }

        return response;
      } catch (error: any) {
        return {
          success: false,
          error: error.message,
        };
      }
    },
  },
];

export const bashToolSet = {
  name: 'bash',
  description: 'Bash 命令执行工具',
  capabilities: [
    'bash - 执行 shell 命令',
  ],
  keywords: ['bash', 'shell', 'command', 'terminal', 'python', '命令执行'],
  estimatedTokens: 350,
};
