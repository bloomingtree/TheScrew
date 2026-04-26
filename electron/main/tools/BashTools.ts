/**
 * Bash 工具 - 统一入口
 * 使用 CommandExecutor 架构执行命令
 */

import { Tool } from './ToolManager';
import { getWorkspacePath } from './FileTools';
import { getCommandExecutor } from './executor/CommandExecutor';
import { ExecuteOptions } from './types';

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

**Smart Features**:
- Auto cross-platform mapping: cp→copy, ls→dir, rm→del, etc.
- Auto quote handling for complex commands
- Auto switch to PowerShell for complex commands
- Auto response file for very long commands (>8000 chars)
- Smart error suggestions when command fails
- Repeat execution detection (warns after 5 repeats in 60s)

**Safety**:
- Dangerous commands (rm -rf /, format, etc.) require confirmation
- Returns \`requiresConfirmation: true\` for dangerous operations

**Usage Examples**:
- Simple commands: bash(command="ls -la")
- Python code: bash(command="python -c \\"print('Hello')\\"")
- Python scripts: bash(command="python script.py arg1 arg2")
- Multiple commands: bash(command="cd src && python test.py")
- Chinese paths: bash(command="python 脚本.py 参数") (auto handled)

**Important - Windows Path Handling**:
- Use forward slashes (/) instead of backslashes (\\) in paths
- Correct: python C:/path/to/script.py arg1 arg2
- If path contains spaces, use quotes: python "C:/path with space/script.py"

**Result Fields**:
- \`success\`: true if exit code is 0
- \`stdout\`: standard output
- \`stderr\`: standard error
- \`exitCode\`: process exit code
- \`executionMethod\`: how the command was executed (direct/powershell/cmd/responseFile)
- \`suggestions\`: fix suggestions if command failed
- \`repeatCount\`: how many times this command was executed recently
- \`requiresConfirmation\`: true if command is dangerous and needs user confirmation
- \`warningLevel\`: 'none' | 'caution' | 'danger'

**Notes**:
- Default timeout: 30 seconds
- Use \`timeout\` parameter for longer tasks
- Check \`suggestions\` field for debugging help`,
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
          description: 'Timeout in milliseconds (optional, defaults to 30000)',
        },
        skipConfirmation: {
          type: 'boolean',
          description: 'Skip confirmation for dangerous commands (only use after user confirmed)',
        },
      },
      required: ['command'],
    },
    handler: async ({ command, cwd, timeout, skipConfirmation }) => {
      try {
        const workspacePath = getWorkspacePath();
        if (!workspacePath && !cwd) {
          return {
            success: false,
            error: '工作空间未设置，请先让用户设置工作空间或指定 cwd 参数',
          };
        }

        const options: ExecuteOptions = {
          cwd: cwd || workspacePath,
          timeout: timeout || 30000,
          skipConfirmation: skipConfirmation || false,
        };

        const executor = getCommandExecutor();
        const result = await executor.execute(command, options);

        // 构建返回结果
        const response: any = {
          success: result.success,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          executionMethod: result.executionMethod,
        };

        // 添加可选字段
        if (result.suggestions && result.suggestions.length > 0) {
          response.suggestions = result.suggestions;
        }

        if (result.requiresConfirmation) {
          response.requiresConfirmation = true;
          response.warningLevel = result.warningLevel;
        }

        if (result.repeatCount && result.repeatCount > 1) {
          response.repeatCount = result.repeatCount;
        }

        if (!result.success) {
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
    '跨平台命令自动映射',
    '智能引号处理',
    '超长命令自动切换响应文件',
    '危险命令安全确认',
    '重复执行检测',
    '智能错误建议',
  ],
  keywords: ['bash', 'shell', 'command', 'terminal', 'python', '命令执行'],
  estimatedTokens: 500,
};
