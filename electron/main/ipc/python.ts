/**
 * Python IPC Handlers
 *
 * 注意：Pyodide 在 Renderer 进程运行
 * 这些 IPC 处理器主要用于与 Main 进程的工具系统集成
 *
 * 实际的 Python 执行通过 Renderer 进程中的 PyodideExecutor 进行
 */

import { ipcMain } from 'electron';

// 危险模式列表（用于验证）
const DANGEROUS_PATTERNS = [
  { pattern: /__import__\s*\(/, msg: '__import__ 被禁用（安全限制）' },
  { pattern: /eval\s*\(/, msg: 'eval 被禁用（安全限制）' },
  { pattern: /exec\s*\(/, msg: 'exec 被禁用（安全限制）' },
  { pattern: /compile\s*\(/, msg: 'compile 被禁用（安全限制）' },
  { pattern: /import\s+os\b/, msg: 'os 模块被禁用（安全限制）' },
  { pattern: /import\s+subprocess\b/, msg: 'subprocess 模块被禁用（安全限制）' },
  { pattern: /from\s+os\s+import/, msg: 'os 模块被禁用（安全限制）' },
  { pattern: /from\s+subprocess\s+import/, msg: 'subprocess 模块被禁用（安全限制）' },
];

// Pyodide 限制警告
const UNSUPPORTED_PATTERNS = [
  { pattern: /import\s+requests\b/, msg: 'requests 模块在 Pyodide 中不可用，考虑使用 pyodide.http' },
  { pattern: /import\s+numpy\b/, msg: 'numpy 需要显式加载 pyodide.loadPackage(["numpy"])' },
  { pattern: /import\s+pandas\b/, msg: 'pandas 需要显式加载 pyodide.loadPackage(["pandas"])' },
  { pattern: /from\s+numpy\s+import/, msg: 'numpy 需要显式加载 pyodide.loadPackage(["numpy"])' },
  { pattern: /from\s+pandas\s+import/, msg: 'pandas 需要显式加载 pyodide.loadPackage(["pandas"])' },
];

/**
 * 验证 Python 代码（在 Main 进程执行简单正则检查）
 */
function validatePythonCode(code: string): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查危险模式
  for (const { pattern, msg } of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      errors.push(msg);
    }
  }

  // 检查不支持的模块
  for (const { pattern, msg } of UNSUPPORTED_PATTERNS) {
    if (pattern.test(code)) {
      warnings.push(msg);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 注册 Python 相关的 IPC 处理器
 */
export function registerPythonHandlers(): void {
  // 获取 Python 运行时状态
  ipcMain.handle('python:getStatus', async () => {
    try {
      return {
        success: true,
        status: {
          backend: 'pyodide',
          ready: false, // Renderer 状态无法直接从 Main 进程获取
          version: '0.26.2',
          description: 'WebAssembly Python runtime (runs in Renderer process)',
        },
      };
    } catch (error: any) {
      console.error('[python:getStatus] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 验证 Python 代码
  ipcMain.handle('python:validate', async (_event, code: string) => {
    try {
      const validation = validatePythonCode(code);
      return {
        success: true,
        validation,
      };
    } catch (error: any) {
      console.error('[python:validate] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 执行 Python 代码
  // 注意：实际执行需要在 Renderer 进程进行
  // 这个处理器主要用于从 Main 进程触发执行
  ipcMain.handle('python:execute', async (event, code: string, options?: { timeout?: number }) => {
    try {
      // 通过 webContents.executeJavaScript 在 Renderer 进程执行
      if (!event.sender) {
        return {
          success: false,
          error: 'No renderer window available',
        };
      }

      const result = await event.sender.executeJavaScript(`
        (async () => {
          try {
            const { executePython } = await import('/src/utils/pyodideWorker.ts');
            return await executePython(
              ${JSON.stringify(code)},
              { timeout: ${options?.timeout || 30000} }
            );
          } catch (error) {
            return {
              success: false,
              error: error.toString(),
            };
          }
        })()
      `);

      return result;
    } catch (error: any) {
      console.error('[python:execute] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 预加载 Pyodide（可选，在应用启动时调用）
  ipcMain.handle('python:init', async (event) => {
    try {
      if (!event.sender) {
        return {
          success: false,
          error: 'No renderer window available',
        };
      }

      const result = await event.sender.executeJavaScript(`
        (async () => {
          try {
            const { initPyodide } = await import('/src/utils/pyodideWorker.ts');
            await initPyodide();
            return { success: true };
          } catch (error) {
            return {
              success: false,
              error: error.toString(),
            };
          }
        })()
      `);

      return result;
    } catch (error: any) {
      console.error('[python:init] Error:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Python IPC handlers registered');
}
