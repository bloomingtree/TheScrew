/**
 * Python 执行工具
 *
 * 整合的 Python 工具，通过 mode 参数支持不同的执行方式
 *
 * 使用 Pyodide (WebAssembly Python)，特点：
 * - 无需 Python 安装
 * - 完全沙箱隔离
 * - 支持离线使用（首次加载后）
 * - 安全限制（禁用危险模块和函数）
 */

import { Tool } from './ToolManager';
import { ipcMain, BrowserWindow } from 'electron';

// 获取当前活跃的 Renderer 窗口
function getFocusedWindow(): BrowserWindow | null {
  const windows = BrowserWindow.getAllWindows();
  return windows.find(w => w.isFocused()) || windows[0] || null;
}

/**
 * 获取应用根路径
 */
function getAppRootPath(): string {
  if (process.env.NODE_ENV === 'development') {
    return require('path').resolve(__dirname, '../../');
  }
  return process.resourcesPath || require('electron').app.getPath('userData');
}

/**
 * 整合的 Python 工具 - 支持 code/script/status 三种模式
 */
export const pythonTools: Tool[] = [
  {
    name: 'exec_python',
    description: `Execute Python code using Pyodide (WebAssembly Python).

Modes:
- 'code': Execute Python code directly (default)
- 'script': Execute a script from .zero-employee/skills/ directory
- 'status': Get Python runtime status
- 'validate': Validate Python code without executing

Usage:
- exec_python(code="print(2 + 2)")
- exec_python(mode="script", skillName="docx", scriptPath="scripts/accept_changes.py", args=["input.docx"])
- exec_python(mode="status")
- exec_python(mode="validate", code="import os")

Security: Automatic timeout (default 30s), dangerous modules blocked (os, subprocess, eval, exec)`,
    parameters: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          description: 'Execution mode: "code" (execute code), "script" (execute from skills), "status" (get status), "validate" (check safety)',
          enum: ['code', 'script', 'status', 'validate'],
          default: 'code',
        },
        code: {
          type: 'string',
          description: 'Python code (for mode="code" or mode="validate")',
        },
        skillName: {
          type: 'string',
          description: 'Skill name (for mode="script", e.g., "docx")',
        },
        scriptPath: {
          type: 'string',
          description: 'Script path relative to skill directory (for mode="script", e.g., "scripts/accept_changes.py")',
        },
        args: {
          type: 'array',
          items: { type: 'string' },
          description: 'Command-line arguments for script (for mode="script")',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in seconds (default: 30, max: 300)',
          default: 30,
        },
      },
    },
    handler: async (args) => {
      const { mode = 'code', code, skillName, scriptPath, args: scriptArgs = [], timeout } = args;

      // 模式分发
      if (mode === 'status') {
        return handleStatus();
      }
      if (mode === 'validate') {
        return handleValidate(code);
      }
      if (mode === 'script') {
        return handleScript(skillName, scriptPath, scriptArgs, timeout);
      }
      // 默认 mode === 'code'
      return handleCode(code, timeout);
    },
  },
];

/**
 * 处理执行代码模式
 */
async function handleCode(code: string, timeout: number = 30) {
  const window = getFocusedWindow();
  if (!window) {
    return {
      success: false,
      error: 'No active renderer window available for Python execution',
    };
  }

  try {
    const result = await window.webContents.executeJavaScript(`
      (async () => {
        try {
          const { executePython } = await import('/src/utils/pyodideWorker.ts');
          return await executePython(
            ${JSON.stringify(code)},
            { timeout: ${(timeout * 1000)} }
          );
        } catch (error) {
          return {
            success: false,
            error: error.toString(),
            executionTime: 0,
          };
        }
      })()
    `);
    return result;
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to execute Python code: ${error.message}`,
    };
  }
}

/**
 * 处理执行脚本模式
 */
async function handleScript(skillName: string, scriptPath: string, scriptArgs: string[], timeout: number = 30) {
  const { readFile } = await import('fs/promises');
  const { join, dirname } = await import('path');
  const { getWorkspacePath } = await import('./FileTools');

  try {
    // 获取工作空间路径
    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
      return {
        success: false,
        error: 'Workspace not set. Please set a workspace first.',
      };
    }

    // 读取脚本文件
    const appRoot = getAppRootPath();
    const scriptFilePath = join(appRoot, '.zero-employee', 'skills', skillName, scriptPath);
    const scriptCode = await readFile(scriptFilePath, 'utf-8');

    // 获取 skill 目录的绝对路径
    const skillDir = join(appRoot, '.zero-employee', 'skills', skillName);
    const scriptDir = dirname(join(skillDir, scriptPath));

    // Python 路径
    const pythonPaths = [skillDir, scriptDir];

    // 构建执行代码
    const argvCode = JSON.stringify([scriptPath, ...scriptArgs]);
    const wrappedCode = `
import sys
import os

sys.argv = ${argvCode}

# 转换文件路径参数为 /workspace 格式
converted_argv = [sys.argv[0]]
for arg in sys.argv[1:]:
    if not arg.startswith('/') and ('.' in arg or '/' in arg or '\\\\' in arg):
        normalized_arg = arg.replace('\\\\\\\\', '/')
        if not normalized_arg.startswith('/workspace'):
            converted_argv.append('/workspace/' + normalized_arg)
        else:
            converted_argv.append(normalized_arg)
    else:
        converted_argv.append(arg)

sys.argv = converted_argv

${scriptCode}
`;

    const window = getFocusedWindow();
    if (!window) {
      return {
        success: false,
        error: 'No active renderer window available for Python execution',
      };
    }

    const result = await window.webContents.executeJavaScript(`
      (async () => {
        try {
          const { executePythonInWorkspace } = await import('/src/utils/pyodideWorker.ts');
          return await executePythonInWorkspace(
            ${JSON.stringify(wrappedCode)},
            ${JSON.stringify(workspacePath)},
            {
              mount: true,
              timeout: ${(timeout * 1000)},
              pythonPath: ${JSON.stringify(pythonPaths)},
              autoSync: true
            }
          );
        } catch (error) {
          return {
            success: false,
            error: error.toString(),
            executionTime: 0,
          };
        }
      })()
    `);

    return {
      ...result,
      script: scriptPath,
      args: scriptArgs,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to execute Python script: ${error.message}`,
    };
  }
}

/**
 * 处理获取状态模式
 */
async function handleStatus() {
  const window = getFocusedWindow();
  if (!window) {
    return {
      success: true,
      status: {
        backend: 'pyodide',
        ready: false,
        version: '0.29.3',
        description: 'WebAssembly Python runtime (no renderer window)',
      },
    };
  }

  try {
    const ready = await window.webContents.executeJavaScript(`
      (async () => {
        try {
          const { isPyodideReady } = await import('/src/utils/pyodideWorker.ts');
          return isPyodideReady();
        } catch {
          return false;
        }
      })()
    `);

    return {
      success: true,
      status: {
        backend: 'pyodide',
        ready,
        version: '0.29.3',
        description: 'WebAssembly Python runtime (runs in Renderer process)',
      },
    };
  } catch {
    return {
      success: true,
      status: {
        backend: 'pyodide',
        ready: false,
        version: '0.29.3',
        description: 'WebAssembly Python runtime',
      },
    };
  }
}

/**
 * 处理验证模式
 */
function handleValidate(code: string) {
  const errors: string[] = [];
  const warnings: string[] = [];

  const dangerousPatterns = [
    { pattern: /__import__\s*\(/, msg: '__import__ 被禁用（安全限制）' },
    { pattern: /eval\s*\(/, msg: 'eval 被禁用（安全限制）' },
    { pattern: /exec\s*\(/, msg: 'exec 被禁用（安全限制）' },
    { pattern: /compile\s*\(/, msg: 'compile 被禁用（安全限制）' },
    { pattern: /import\s+os\s/, msg: 'os 模块被禁用（安全限制）' },
    { pattern: /import\s+subprocess\b/, msg: 'subprocess 模块被禁用（安全限制）' },
    { pattern: /from\s+os\s+import/, msg: 'os 模块被禁用（安全限制）' },
    { pattern: /from\s+subprocess\s+import/, msg: 'subprocess 模块被禁用（安全限制）' },
  ];

  for (const { pattern, msg } of dangerousPatterns) {
    if (pattern.test(code)) {
      errors.push(msg);
    }
  }

  const unsupportedPatterns = [
    { pattern: /import\s+requests\b/, msg: 'requests 模块在 Pyodide 中不可用' },
    { pattern: /import\s+numpy\b/, msg: 'numpy 需要显式加载' },
    { pattern: /import\s+pandas\b/, msg: 'pandas 需要显式加载' },
  ];

  for (const { pattern, msg } of unsupportedPatterns) {
    if (pattern.test(code)) {
      warnings.push(msg);
    }
  }

  return {
    success: true,
    valid: errors.length === 0,
    errors,
    warnings,
    summary: errors.length === 0
      ? '代码有效且安全'
      : `验证失败：${errors.length} 个错误`,
  };
}

/**
 * Python 工具组元数据
 */
export const PYTHON_TOOL_SET_META = {
  name: 'python',
  description: 'Python 代码执行：使用 Pyodide (WebAssembly) 安全执行 Python 代码',
  capabilities: [
    'exec_python - 执行 Python 代码/脚本/获取状态/验证代码'
  ],
  keywords: ['python', 'py', '代码执行', 'code execution'],
  estimatedTokens: 300, // 整合后 token 数大幅减少
};
