import { spawn } from 'child_process';
import path from 'path';
import { app } from 'electron';
import { Tool } from './ToolManager';
import { getWorkspacePath } from './FileTools';

/**
 * 获取应用根路径
 * 开发环境: 项目根目录
 * 生产环境: resources 目录
 */
function getAppRootPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return path.resolve(__dirname, '../../..');
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
 * 获取项目 Python 可执行文件路径
 */
function getPythonPath(): string {
  return path.join(getPythonDir(), 'python.exe');
}

/**
 * 获取增强的 PATH 环境变量（包含项目 Python）
 */
function getEnhancedPath(): string {
  const pythonDir = getPythonDir();
  const currentPath = process.env.PATH || '';
  // 将项目 Python 目录放在最前面，确保优先使用
  return `${pythonDir}${path.delimiter}${currentPath}`;
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

    // 合并环境变量
    const enhancedEnv = {
      ...process.env,
      PATH: getEnhancedPath(),
      PYTHONHOME: pythonDir,
      PYTHONPATH: path.join(pythonDir, 'Lib'),
      ...env,
    };

    const child = spawn(shell, shellArgs, {
      cwd: cwd || getWorkspacePath() || undefined,
      env: enhancedEnv,
      shell: true,
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

  {
    name: 'python_version',
    description: '获取 Python 环境信息，包括项目内置 Python 和系统 Python',
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
      try {
        const pythonPath = getPythonPath();
        const enhancedPath = getEnhancedPath();

        // 测试项目 Python
        const projectPythonResult = await executeCommand('python --version', {
          timeout: 5000,
        });

        return {
          success: true,
          projectPythonPath: pythonPath,
          enhancedPath: enhancedPath.split(path.delimiter).slice(0, 3).join(path.delimiter) + '...',
          versionOutput: projectPythonResult.stdout || projectPythonResult.stderr,
        };
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
    'python_version - 获取 Python 环境信息',
  ],
  keywords: ['bash', 'shell', 'command', 'terminal', 'python', '命令执行'],
  estimatedTokens: 350,
};
