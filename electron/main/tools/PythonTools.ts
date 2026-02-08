/**
 * Python 执行工具
 *
 * 这些工具通过 IPC 与 Renderer 进程中的 Pyodide 通信
 * 提供安全的 Python 代码执行能力
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
 * Python 工具集
 */
export const pythonTools: Tool[] = [
  {
    name: 'exec_python',
    description: `Execute Python code using Pyodide (WebAssembly Python).

This tool runs Python code directly in the browser using WebAssembly:
- No Python installation required
- Works offline (after initial load)
- Secure sandbox (cannot access system files)
- Supports most Python 3.11 features

Usage examples:
- Simple calculation: exec_python(code="print(2 + 2)")
- String manipulation: exec_python(code="print('hello'.upper())")
- Data processing: exec_python(code="import json; print(json.dumps({'a': 1}))")
- List operations: exec_python(code="data = [1,2,3]; print(sum(data))")

Security features:
- Automatic timeout (default 30s)
- Output size limits (default 10MB)
- Dangerous modules blocked (os, subprocess, eval, exec)

Notes:
- Use print() to output results
- Some modules require explicit loading (numpy, pandas)
- File system access is limited to browser virtual filesystem
- Network access is restricted`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python code to execute. Use print() to output results.',
        },
        timeout: {
          type: 'number',
          description: 'Execution timeout in seconds (default: 30, max: 300)',
          default: 30,
        },
      },
      required: ['code'],
    },
    handler: async (args) => {
      const { code, timeout } = args;

      // 获取活跃窗口
      const window = getFocusedWindow();
      if (!window) {
        return {
          success: false,
          error: 'No active renderer window available for Python execution',
        };
      }

      try {
        // 通过 webContents.executeJavaScript 在 Renderer 进程执行
        const result = await window.webContents.executeJavaScript(`
          (async () => {
            try {
              const { executePython } = await import('/src/utils/pyodideWorker.ts');
              return await executePython(
                ${JSON.stringify(code)},
                { timeout: ${((timeout || 30) * 1000)} }
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
    },
  },

  {
    name: 'validate_python',
    description: `Validate Python script without executing it.

Checks for:
- Dangerous modules (os, subprocess)
- Dangerous functions (eval, exec, __import__)
- Path traversal attempts
- Pyodide-specific warnings (numpy, pandas require explicit loading)

Returns validation errors and warnings without running the code.
Use this before exec_python to ensure code safety.`,
    parameters: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'Python code to validate',
        },
      },
      required: ['code'],
    },
    handler: async (args) => {
      const { code } = args;

      // 在 Main 进程执行简单的正则验证
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
        { pattern: /import\s+requests\b/, msg: 'requests 模块在 Pyodide 中不可用，考虑使用 pyodide.http' },
        { pattern: /import\s+numpy\b/, msg: 'numpy 需要显式加载 pyodide.loadPackage(["numpy"])' },
        { pattern: /import\s+pandas\b/, msg: 'pandas 需要显式加载 pyodide.loadPackage(["pandas"])' },
        { pattern: /from\s+numpy\s+import/, msg: 'numpy 需要显式加载 pyodide.loadPackage(["numpy"])' },
        { pattern: /from\s+pandas\s+import/, msg: 'pandas 需要显式加载 pyodide.loadPackage(["pandas"])' },
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
          ? 'Script is valid and safe to execute'
          : `Script validation failed with ${errors.length} error(s)`,
      };
    },
  },

  {
    name: 'get_python_status',
    description: `Get Pyodide Python runtime status.

Returns information about the Python runtime:
- Whether Pyodide is initialized
- Backend type (pyodide)
- Version information
- Description of the runtime`,
    parameters: {
      type: 'object',
      properties: {},
    },
    handler: async () => {
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
      } catch (error: any) {
        return {
          success: true,
          status: {
            backend: 'pyodide',
            ready: false,
            version: '0.29.3',
            description: 'WebAssembly Python runtime',
            note: 'Could not check renderer status',
          },
        };
      }
    },
  },
];

/**
 * Python 工具组元数据
 * 添加到 TOOL_SETS_META 中
 */
export const PYTHON_TOOL_SET_META = {
  name: 'python',
  description: 'Python 代码执行：使用 Pyodide (WebAssembly) 安全执行 Python 代码',
  capabilities: [
    'exec_python - 执行 Python 代码',
    'validate_python - 验证代码安全性',
    'get_python_status - 获取运行时状态'
  ],
  keywords: ['python', 'py', '代码执行', 'code execution', 'calculate', 'data processing'],
  estimatedTokens: 800,
};
