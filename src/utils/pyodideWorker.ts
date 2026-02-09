/**
 * Pyodide Worker - 在 Renderer 进程中直接执行
 *
 * 这个模块导出 Pyodide 执行器的便捷函数
 * 可以直接在 React 组件或其他 Renderer 进程代码中使用
 *
 * 使用示例：
 * ```typescript
 * import { executePython, validatePython } from '@/utils/pyodideWorker';
 *
 * // 执行 Python 代码
 * const result = await executePython('print(2 + 2)');
 * console.log(result.output); // "4"
 *
 * // 验证代码
 * const validation = validatePython('import os');
 * console.log(validation.valid); // false
 *
 * // 在工作空间中执行
 * const wsResult = await executePythonInWorkspace(
 *   'with open("data.txt") as f: print(f.read())',
 *   '/path/to/workspace'
 * );
 * ```
 */

import {
  pyodideExecutor,
  type PyodideExecutionOptions,
  type PyodideExecutionResult,
  type ValidationResult,
} from './PyodideExecutor';
import type { WorkspaceFile, MountPointConfig } from './PyodideFileSystemBridge';

/**
 * 执行 Python 代码
 *
 * @param code Python 代码
 * @param options 执行选项
 * @returns 执行结果
 */
export async function executePython(
  code: string,
  options?: PyodideExecutionOptions
): Promise<PyodideExecutionResult> {
  return pyodideExecutor.execute(code, options);
}

/**
 * 验证 Python 代码（不执行）
 *
 * @param code Python 代码
 * @returns 验证结果
 */
export function validatePython(code: string): ValidationResult {
  return pyodideExecutor.validate(code);
}

/**
 * 检查 Pyodide 是否已初始化
 *
 * @returns 是否已就绪
 */
export function isPyodideReady(): boolean {
  return pyodideExecutor.isReady();
}

/**
 * 获取 Pyodide 版本信息
 *
 * @returns 版本字符串
 */
export function getPyodideVersion(): string {
  return pyodideExecutor.getVersion();
}

/**
 * 预初始化 Pyodide（可选，在应用启动时调用）
 *
 * 这会在后台加载 Pyodide，之后的 executePython 调用会更快
 *
 * @returns Promise，在初始化完成时 resolve
 */
export async function initPyodide(): Promise<void> {
  await pyodideExecutor.init();
}

/**
 * 重置 Pyodide 实例
 *
 * 清除已加载的 Pyodide 实例，下次执行时会重新初始化
 */
export function resetPyodide(): void {
  pyodideExecutor.reset();
}

// ============================================================================
// 工作空间文件系统支持
// ============================================================================

/**
 * 在工作空间中执行 Python 代码
 *
 * 此函数会：
 * 1. 挂载工作空间到 Pyodide 的虚拟文件系统
 * 2. 将工作空间目录设置为 Python 的当前工作目录
 * 3. 执行 Python 代码
 * 4. （可选）自动将修改的文件同步回本地文件系统
 *
 * @param code Python 代码
 * @param workspacePath 工作空间路径
 * @param options 执行选项
 * @returns 执行结果
 *
 * @example
 * ```typescript
 * // 读取并处理工作空间中的文件
 * const result = await executePythonInWorkspace(
 *   `
 *   import json
 *   with open('data/input.json', 'r') as f:
 *       data = json.load(f)
 *   print(f"Loaded {len(data)} items")
 *   `,
 *   '/path/to/workspace',
 *   { autoSync: true }
 * );
 * ```
 */
export async function executePythonInWorkspace(
  code: string,
  workspacePath: string,
  options?: {
    mount?: boolean;
    maxFileSize?: number;
    timeout?: number;
    autoSync?: boolean;
    /** 配置文件夹路径（.zero-employee） */
    configPath?: string;
    /** 额外的 Python 路径，用于加载模块 */
    pythonPath?: string[];
  }
): Promise<PyodideExecutionResult> {
  return pyodideExecutor.executeInWorkspace(code, workspacePath, options);
}

/**
 * 获取工作空间文件列表
 *
 * @param workspacePath 工作空间路径
 * @returns 文件列表
 */
export async function listWorkspaceFiles(workspacePath: string): Promise<WorkspaceFile[]> {
  return pyodideExecutor.listWorkspaceFiles(workspacePath);
}

/**
 * 同步文件到磁盘
 *
 * 将 Pyodide 虚拟文件系统中的文件写回到本地文件系统
 *
 * @param memfsPath MEMFS 中的文件路径
 * @returns 同步结果
 */
export async function syncFileToDisk(memfsPath: string): Promise<{
  success: boolean;
  error?: string;
}> {
  return pyodideExecutor.syncToDisk(memfsPath);
}

/**
 * 挂载工作空间到 Pyodide 文件系统
 *
 * @param workspacePath 工作空间路径
 * @param options 挂载选项
 * @returns 是否成功挂载
 */
export async function mountWorkspace(
  workspacePath: string,
  options?: {
    maxFileSize?: number;
    pattern?: RegExp;
    exclude?: RegExp;
  }
): Promise<boolean> {
  return pyodideExecutor.mountWorkspace(workspacePath, options);
}

/**
 * 检查工作空间是否已挂载
 *
 * @returns 是否已挂载
 */
export function isWorkspaceMounted(): boolean {
  return pyodideExecutor.isWorkspaceMounted();
}

/**
 * 获取当前挂载的工作空间路径
 *
 * @returns 工作空间路径或 null
 */
export function getMountedWorkspace(): string | null {
  return pyodideExecutor.getMountedWorkspace();
}

/**
 * 卸载工作空间
 */
export function unmountWorkspace(): void {
  pyodideExecutor.unmountWorkspace();
}

/**
 * 挂载工作空间和配置目录
 *
 * @param workspacePath 工作空间路径
 * @param configPath 配置目录路径（可选，如 .zero-employee）
 * @param options 挂载选项
 * @returns 是否成功挂载
 *
 * @example
 * ```typescript
 * // 挂载工作空间和配置
 * await mountWorkspaceAndConfig(
 *   'D:\\work\\myproject',
 *   'D:\\work\\myproject\\.zero-employee'
 * );
 * ```
 */
export async function mountWorkspaceAndConfig(
  workspacePath: string,
  configPath?: string,
  options?: {
    maxFileSize?: number;
    pattern?: RegExp;
    exclude?: RegExp;
  }
): Promise<boolean> {
  return pyodideExecutor.mountWorkspaceAndConfig(workspacePath, configPath, options);
}

// ============================================================================
// 多挂载点支持（高级用法）
// ============================================================================

/**
 * 注册一个挂载点
 *
 * @param name 挂载点名称（如 'workspace', 'config'）
 * @param localPath 本地文件系统路径
 * @param type 挂载点类型
 *
 * @example
 * ```typescript
 * // 注册工作空间和配置文件夹
 * registerMountPoint('workspace', 'D:\\work\\myproject', 'workspace');
 * registerMountPoint('config', 'D:\\work\\myproject\\.zero-employee', 'config');
 *
 * // 挂载所有
 * await mountAll();
 * ```
 */
export function registerMountPoint(
  name: string,
  localPath: string,
  type: MountPointConfig['type'] = 'custom'
): void {
  pyodideExecutor.registerMountPoint(name, localPath, type);
}

/**
 * 挂载单个挂载点
 *
 * @param name 挂载点名称
 * @returns 是否成功挂载
 */
export async function mountPoint(name: string): Promise<boolean> {
  return pyodideExecutor.mountPoint(name);
}

/**
 * 挂载所有已注册的挂载点
 *
 * @returns 是否全部成功挂载
 */
export async function mountAll(): Promise<boolean> {
  return pyodideExecutor.mountAll();
}

/**
 * 从指定挂载点读取文件
 *
 * @param mountName 挂载点名称
 * @param relativePath 相对路径
 * @returns 文件内容（字符串）
 *
 * @example
 * ```typescript
 * const content = await readFromMount('config', 'settings.json');
 * ```
 */
export async function readFromMount(mountName: string, relativePath: string): Promise<string> {
  return pyodideExecutor.readFromMount(mountName, relativePath);
}

/**
 * 写入文件到指定挂载点
 *
 * @param mountName 挂载点名称
 * @param relativePath 相对路径
 * @param content 文件内容
 * @param encoding 编码（可选）
 *
 * @example
 * ```typescript
 * await writeToMount('config', 'settings.json', JSON.stringify(newConfig));
 * ```
 */
export async function writeToMount(
  mountName: string,
  relativePath: string,
  content: string,
  encoding?: 'utf-8' | 'base64'
): Promise<void> {
  return pyodideExecutor.writeToMount(mountName, relativePath, content, encoding);
}

/**
 * 获取所有挂载点
 *
 * @returns 挂载点配置列表
 */
export function getMountPoints(): MountPointConfig[] {
  return pyodideExecutor.getMountPoints();
}

/**
 * 卸载指定挂载点
 *
 * @param name 挂载点名称，如果为空则卸载 workspace
 */
export function unmountPoint(name?: string): void {
  pyodideExecutor.unmountPoint(name);
}

/**
 * 卸载所有挂载点
 */
export function unmountAllPoints(): void {
  pyodideExecutor.unmountAllPoints();
}

// 重新导出类型
export type { PyodideExecutionOptions, PyodideExecutionResult, ValidationResult, WorkspaceFile, MountPointConfig };
