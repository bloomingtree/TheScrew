import { spawn } from 'child_process';
import path from 'path';
import { app } from 'electron';
import { Tool } from './ToolManager';
import { getWorkspacePath } from './FileTools';

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
 */
function getPythonDir(): string {
  return path.join(getAppRootPath(), 'electron', 'main', 'python', 'python-3.8.10-embed-amd64');
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

  return new Promise((resolve) => {
    // 在 Windows 上使用 cmd.exe
    const shell = process.platform === 'win32' ? 'cmd.exe' : 'bash';
    const shellArgs = process.platform === 'win32' ? ['/c', command] : ['-c', command];

    // 构建 PATH：项目 Python 目录必须在最前面
    const pathSeparator = process.platform === 'win32' ? ';' : ':';
    const newPATH = `${pythonDir}${pathSeparator}${process.env.PATH || ''}`;

    // 合并环境变量，确保项目 Python 优先
    // 注意：Windows 嵌入式 Python 使用 python38._pth 文件控制模块搜索路径
    // 不需要设置 PYTHONHOME/PYTHONPATH，这可能会与 _pth 文件冲突
    const enhancedEnv: Record<string, string> = {
      ...process.env,
      PATH: newPATH,
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
    description: `Execute bash/shell commands in the workspace directory.

**Python Support**:
- Built-in Python 3.8.10 is pre-configured and ready to use
- Use \`python\` or \`python.exe\` directly to run Python code and scripts
- No additional setup required - Python is integrated into the shell environment

**Features**:
- Executes commands in the workspace root directory
- Python commands (\`python\` or \`python.exe\`) automatically use the built-in Python 3.8.10
- Environment variables are preserved and enhanced with Python path
- Default timeout: 120 seconds

**Usage**:
- Simple commands: bash(command="ls -la")
- Python code: bash(command="python -c \\"print('Hello')\\"")
- Python scripts: bash(command="python script.py arg1 arg2")
- Multiple commands: bash(command="cd src && python test.py")

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
          stdout: result.stdout,
          stderr: result.stderr,
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
