/**
 * PyodideExecutor - Pyodide Python 执行器
 *
 * 在 Renderer 进程中运行，使用 WebAssembly Python
 *
 * 关键修复：在 Electron 中加载 Pyodide 前需要设置 process.browser = true
 * 参考：https://github.com/pyodide/pyodide/discussions/2248
 */

import { loadPyodide, PyodideInterface } from 'pyodide';
import { PyodideFileSystemBridge, WorkspaceFile } from './PyodideFileSystemBridge';

export interface PyodideExecutionOptions {
  /** 超时时间（毫秒），默认 30 秒 */
  timeout?: number;
  /** 输出大小限制（字节），默认 10MB */
  maxOutputSize?: number;
}

export interface PyodideExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  timedOut?: boolean;
  executionTime?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Pyodide 执行器单例
 */
class PyodideExecutorManager {
  private pyodide: PyodideInterface | null = null;
  private initializing: Promise<PyodideInterface> | null = null;
  private indexURL: string;
  private fsBridge: PyodideFileSystemBridge | null = null;

  constructor() {
    // 使用本地离线文件（复制到 public 根目录）
    this.indexURL = './pyodide-full/';
  }

  /**
   * 初始化 Pyodide
   *
   * 关键：在加载前设置 process.browser = true
   *
   * Pyodide 检测 Node.js 环境的逻辑：
   * ```typescript
   * const IN_NODE = typeof process !== "undefined" &&
   *                 process.release &&
   *                 process.release.name === "node" &&
   *                 typeof process.browser === "undefined";
   * ```
   *
   * 设置 process.browser = true 可以绕过这个检测，强制使用浏览器模式。
   */
  async init(): Promise<PyodideInterface> {
    if (this.pyodide) {
      return this.pyodide;
    }

    if (this.initializing) {
      return this.initializing;
    }

    // 关键修复：强制浏览器模式（仅在 process 存在时）
    // 参考：https://github.com/pyodide/pyodide/discussions/2248
    if (typeof process !== 'undefined' && process) {
      (process as any).browser = true;
    }

    this.initializing = (async () => {
      try {
        console.log('[Pyodide] Initializing Pyodide from:', this.indexURL);
        this.pyodide = await loadPyodide({
          indexURL: this.indexURL,
        });

        // 预加载常用的 Python 包
        console.log('[Pyodide] Preloading packages...');
        const packages = [
          'openpyxl',
          'lxml',
          'defusedxml',
          'Pillow',
          'xlsxwriter',
          'python-pptx',
          'pypdf',
          'pdfplumber',
          'reportlab',
          'numpy',
          'pandas',
        ];

        try {
          await this.pyodide.loadPackage(packages);
          console.log('[Pyodide] All packages preloaded successfully');
        } catch (error) {
          console.warn('[Pyodide] Some packages failed to preload:', error);
          // 不阻塞初始化，包可以在运行时加载
        }

        console.log('[Pyodide] Pyodide initialized successfully');
        return this.pyodide;
      } catch (error) {
        console.error('[Pyodide] Initialization failed:', error);
        this.initializing = null;
        throw error;
      }
    })();

    return this.initializing;
  }

  /**
   * 执行 Python 代码
   *
   * @param code Python 代码
   * @param options 执行选项（超时、输出限制等）
   * @returns 执行结果
   */
  async execute(
    code: string,
    options: PyodideExecutionOptions = {}
  ): Promise<PyodideExecutionResult> {
    const startTime = Date.now();
    const timeout = options.timeout || 30000;
    const maxOutputSize = options.maxOutputSize || 10 * 1024 * 1024;

    try {
      const pyodide = await this.init();

      // 设置超时
      const timeoutHandle = new AbortController();
      const timeoutId = setTimeout(() => {
        timeoutHandle.abort();
      }, timeout);

      // 重定向输出
      let output = '';
      let errorOutput = '';

      pyodide.setStdout({
        batched: (str: string) => {
          output += str;
          if (output.length > maxOutputSize) {
            timeoutHandle.abort();
          }
        },
      });

      pyodide.setStderr({
        batched: (str: string) => {
          errorOutput += str;
          if (errorOutput.length > maxOutputSize) {
            timeoutHandle.abort();
          }
        },
      });

      // 执行代码
      try {
        await pyodide.runPythonAsync(code);
        clearTimeout(timeoutId);

        const result: PyodideExecutionResult = {
          success: errorOutput.length === 0,
          output: output.slice(0, maxOutputSize),
          error: errorOutput || undefined,
          executionTime: Date.now() - startTime,
        };

        if (output.length > maxOutputSize) {
          result.timedOut = true;
          result.error = `Output size exceeds limit (${maxOutputSize} bytes)`;
        }

        return result;
      } catch (error: any) {
        clearTimeout(timeoutId);

        // 检查是否是超时导致的 abort
        if (timeoutHandle.signal.aborted) {
          return {
            success: false,
            error: `Execution timeout after ${timeout}ms`,
            timedOut: true,
            executionTime: Date.now() - startTime,
          };
        }

        return {
          success: false,
          error: error.toString(),
          executionTime: Date.now() - startTime,
        };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Pyodide initialization failed: ${error.message}`,
        executionTime: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // 工作空间文件系统支持
  // ============================================================================

  /**
   * 初始化文件系统桥接
   */
  initFileSystemBridge(): void {
    if (this.pyodide && !this.fsBridge) {
      this.fsBridge = new PyodideFileSystemBridge(this.pyodide);
      console.log('[Pyodide] File system bridge initialized');
    }
  }

  /**
   * 挂载工作空间到 Pyodide 文件系统
   *
   * @param workspacePath 工作空间路径
   * @param options 挂载选项
   * @returns 是否成功挂载
   */
  async mountWorkspace(
    workspacePath: string,
    options?: {
      maxFileSize?: number;
      pattern?: RegExp;
      exclude?: RegExp;
    }
  ): Promise<boolean> {
    if (!this.pyodide) {
      await this.init();
    }

    if (!this.fsBridge) {
      this.initFileSystemBridge();
    }

    if (!this.fsBridge) {
      return false;
    }

    return await this.fsBridge.mountWorkspace(workspacePath, options);
  }

  /**
   * 在工作空间中执行 Python 代码
   *
   * @param code Python 代码
   * @param workspacePath 工作空间路径
   * @param options 执行选项
   * @returns 执行结果
   */
  async executeInWorkspace(
    code: string,
    workspacePath: string,
    options?: {
      mount?: boolean;
      maxFileSize?: number;
      timeout?: number;
      autoSync?: boolean;
    }
  ): Promise<PyodideExecutionResult> {
    // 挂载工作空间
    if (options?.mount !== false) {
      const mounted = await this.mountWorkspace(workspacePath, {
        maxFileSize: options?.maxFileSize
      });

      if (!mounted) {
        return {
          success: false,
          error: 'Failed to mount workspace'
        };
      }
    }

    // 添加工作空间到 Python 路径并切换目录
    const mountPoint = this.fsBridge?.getMountPoint() ?? '/workspace';
    const wrappedCode = `
import os
import sys

# 添加工作空间到 Python 路径
sys.path.insert(0, '${mountPoint}')
os.chdir('${mountPoint}')

${code}
`;

    // 执行代码
    const result = await this.execute(wrappedCode, {
      timeout: options?.timeout
    });

    // 如果启用自动同步，将修改写回磁盘
    if (options?.autoSync && this.fsBridge) {
      try {
        const syncResults = await this.fsBridge.syncAllToDisk();
        const failedSyncs = syncResults.filter(r => !r.success);

        if (failedSyncs.length > 0) {
          result.output = (result.output || '') + `\n[Warning] ${failedSyncs.length} file(s) failed to sync`;
        }
      } catch (e: any) {
        result.output = (result.output || '') + `\n[Error] Failed to sync files: ${e.message}`;
      }
    }

    return result;
  }

  /**
   * 将 MEMFS 中的文件写回本地文件系统
   *
   * @param memfsPath MEMFS 中的文件路径
   * @returns 同步结果
   */
  async syncToDisk(memfsPath: string): Promise<{ success: boolean; error?: string }> {
    if (!this.fsBridge) {
      return { success: false, error: 'File system bridge not initialized' };
    }

    return await this.fsBridge.syncFileToDisk(memfsPath);
  }

  /**
   * 获取工作空间文件列表
   *
   * @returns 文件列表
   */
  async listWorkspaceFiles(workspacePath: string): Promise<WorkspaceFile[]> {
    const result = await window.electronAPI.pyodide.listFiles(workspacePath);
    if (result.success && result.files) {
      return result.files;
    }
    return [];
  }

  /**
   * 获取当前挂载的工作空间路径
   */
  getMountedWorkspace(): string | null {
    return this.fsBridge?.getMountedWorkspace() || null;
  }

  /**
   * 检查工作空间是否已挂载
   */
  isWorkspaceMounted(): boolean {
    return this.fsBridge?.isMounted() || false;
  }

  /**
   * 卸载工作空间
   */
  unmountWorkspace(): void {
    if (this.fsBridge) {
      this.fsBridge.unmount();
    }
  }

  // ============================================================================
  // 验证和状态方法
  // ============================================================================

  /**
   * 验证 Python 代码（不执行）
   *
   * 检查危险操作和 Pyodide 限制
   */
  validate(code: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 检查危险操作
    const dangerousPatterns = [
      { pattern: /import\s+os\b/, msg: 'os 模块被禁用（安全限制）' },
      { pattern: /import\s+subprocess\b/, msg: 'subprocess 模块被禁用（安全限制）' },
      { pattern: /from\s+os\s+import/, msg: 'os 模块被禁用（安全限制）' },
      { pattern: /from\s+subprocess\s+import/, msg: 'subprocess 模块被禁用（安全限制）' },
      { pattern: /__import__\s*\(/, msg: '__import__ 被禁用（安全限制）' },
      { pattern: /eval\s*\(/, msg: 'eval 被禁用（安全限制）' },
      { pattern: /exec\s*\(/, msg: 'exec 被禁用（安全限制）' },
      { pattern: /open\s*\(['"`]\s*[~/]/, msg: '路径遍历尝试被阻止（安全限制）' },
      { pattern: /compile\s*\(/, msg: 'compile 被禁用（安全限制）' },
    ];

    for (const { pattern, msg } of dangerousPatterns) {
      if (pattern.test(code)) {
        errors.push(msg);
      }
    }

    // Pyodide 限制警告
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
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 检查是否已初始化
   */
  isReady(): boolean {
    return this.pyodide !== null;
  }

  /**
   * 获取 Pyodide 版本信息
   */
  getVersion(): string {
    return this.pyodide ? '0.29.3' : 'not loaded';
  }

  /**
   * 重置 Pyodide 实例
   */
  reset(): void {
    this.pyodide = null;
    this.initializing = null;
    this.fsBridge = null;
  }
}

// 导出单例
export const pyodideExecutor = new PyodideExecutorManager();

// 重新导出类型
export type { PyodideInterface };
