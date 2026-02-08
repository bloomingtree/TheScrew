/**
 * Pyodide 文件系统桥接器
 *
 * 将工作空间文件桥接到 Pyodide 的虚拟文件系统中
 *
 * 工作原理：
 * 1. 通过 IPC 从 Main 进程读取文件列表
 * 2. 将文件内容写入 Pyodide 的 MEMFS
 * 3. Python 代码在 MEMFS 中运行
 * 4. 修改的文件通过 IPC 写回本地文件系统
 */

import type { PyodideInterface } from 'pyodide';

/**
 * 工作空间文件信息
 */
export interface WorkspaceFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: Date;
}

/**
 * 桥接选项
 */
export interface BridgeOptions {
  /** 最大文件大小限制（字节），默认 50MB */
  maxFileSize?: number;
  /** 要包含的文件模式 */
  pattern?: RegExp;
  /** 要排除的文件模式 */
  exclude?: RegExp;
  /** 是否跳过隐藏文件，默认 true */
  skipHidden?: boolean;
}

/**
 * 文件同步状态
 */
export interface SyncResult {
  success: boolean;
  path?: string;
  error?: string;
}

/**
 * Pyodide 文件系统桥接器
 *
 * 用于将本地工作空间挂载到 Pyodide 的虚拟文件系统中
 */
export class PyodideFileSystemBridge {
  private pyodide: PyodideInterface;
  private workspaceMountPoint: string;
  private mountedWorkspace: string | null = null;
  private fileCache: Map<string, { content: string; timestamp: number }> = new Map();
  private fileListCache: WorkspaceFile[] = [];

  constructor(pyodide: PyodideInterface, mountPoint = '/workspace') {
    this.pyodide = pyodide;
    this.workspaceMountPoint = mountPoint;
  }

  /**
   * 挂载工作空间到 Pyodide 文件系统
   *
   * @param workspacePath 本地工作空间路径
   * @param options 桥接选项
   * @returns 是否成功挂载
   */
  async mountWorkspace(workspacePath: string, options: BridgeOptions = {}): Promise<boolean> {
    try {
      console.log('[PyodideFS] Mounting workspace:', workspacePath);

      // 1. 从 Main 进程获取文件列表
      const fileList = await window.electronAPI.pyodide.listFiles(workspacePath);

      if (!fileList.success || !fileList.files) {
        throw new Error(fileList.error || 'Failed to list files');
      }

      // 2. 过滤文件
      const files = this.filterFiles(fileList.files, options);
      this.fileListCache = files;

      // 3. 在 MEMFS 中创建目录结构并加载文件
      let fileCount = 0;
      let totalSize = 0;

      for (const file of files) {
        const memfsPath = `${this.workspaceMountPoint}/${file.path}`;

        if (file.type === 'directory') {
          // 创建目录
          try {
            this.pyodide.FS.mkdirTree(memfsPath);
          } catch (e) {
            // 目录可能已存在，忽略错误
          }
        } else {
          // 读取文件内容
          const fileResult = await window.electronAPI.pyodide.readFile(workspacePath, file.path);

          if (fileResult.success && fileResult.content !== undefined) {
            // 创建目录（如果需要）
            const dirPath = memfsPath.substring(0, memfsPath.lastIndexOf('/'));
            if (dirPath && dirPath !== this.workspaceMountPoint) {
              try {
                this.pyodide.FS.mkdirTree(dirPath);
              } catch (e) {
                // 目录可能已存在
              }
            }

            // 写入文件到 MEMFS
            try {
              this.pyodide.FS.writeFile(memfsPath, fileResult.content);

              // 缓存文件内容
              this.fileCache.set(file.path, {
                content: fileResult.content,
                timestamp: Date.now()
              });

              fileCount++;
              if (file.size) {
                totalSize += file.size;
              }
            } catch (e) {
              console.warn(`[PyodideFS] Failed to write file: ${memfsPath}`, e);
            }
          }
        }
      }

      this.mountedWorkspace = workspacePath;

      console.log('[PyodideFS] Workspace mounted successfully');
      console.log(`[PyodideFS] Files: ${fileCount}, Size: ${(totalSize / 1024).toFixed(2)} KB`);

      return true;
    } catch (error) {
      console.error('[PyodideFS] Failed to mount workspace:', error);
      return false;
    }
  }

  /**
   * 过滤文件列表
   */
  private filterFiles(files: WorkspaceFile[], options: BridgeOptions): WorkspaceFile[] {
    let filtered = [...files];

    // 应用隐藏文件过滤
    if (options.skipHidden !== false) {
      filtered = filtered.filter(f => !f.name.startsWith('.'));
    }

    // 应用大小限制
    if (options.maxFileSize) {
      filtered = filtered.filter(f =>
        f.type === 'directory' || (f.size !== undefined && f.size <= options.maxFileSize!)
      );
    }

    // 应用包含模式
    if (options.pattern) {
      filtered = filtered.filter(f => options.pattern!.test(f.path));
    }

    // 应用排除模式
    if (options.exclude) {
      filtered = filtered.filter(f => !options.exclude!.test(f.path));
    }

    return filtered;
  }

  /**
   * 同步单个文件到本地文件系统
   *
   * @param memfsPath MEMFS 中的文件路径
   * @returns 同步结果
   */
  async syncFileToDisk(memfsPath: string): Promise<SyncResult> {
    if (!this.mountedWorkspace) {
      return { success: false, error: 'No workspace mounted' };
    }

    try {
      // 将 MEMFS 路径转换为相对路径
      const relativePath = memfsPath.substring(this.workspaceMountPoint.length + 1);

      // 读取文件内容
      let content: string;
      try {
        content = this.pyodide.FS.readFile(memfsPath, { encoding: 'utf8' });
      } catch (error: any) {
        return { success: false, error: `Failed to read file: ${error.message}` };
      }

      // 通过 IPC 写入本地文件
      const result = await window.electronAPI.pyodide.writeFile(
        this.mountedWorkspace,
        relativePath,
        content
      );

      if (result.success) {
        // 更新缓存
        this.fileCache.set(relativePath, {
          content,
          timestamp: Date.now()
        });

        return { success: true, path: relativePath };
      }

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 同步所有修改的文件到本地文件系统
   *
   * @returns 同步结果列表
   */
  async syncAllToDisk(): Promise<SyncResult[]> {
    if (!this.mountedWorkspace) {
      return [{ success: false, error: 'No workspace mounted' }];
    }

    const results: SyncResult[] = [];

    // 遍历所有文件并同步
    for (const [relativePath, cached] of this.fileCache) {
      const memfsPath = `${this.workspaceMountPoint}/${relativePath}`;

      // 读取当前 MEMFS 内容
      try {
        const currentContent = this.pyodide.FS.readFile(memfsPath, { encoding: 'utf8' });

        // 如果内容有变化，同步到磁盘
        if (currentContent !== cached.content) {
          const result = await this.syncFileToDisk(memfsPath);
          results.push(result);
        }
      } catch (e) {
        // 文件可能被删除或修改
        results.push({
          success: false,
          path: relativePath,
          error: 'File not found in MEMFS'
        });
      }
    }

    return results;
  }

  /**
   * 从本地文件系统重新加载文件到 MEMFS
   *
   * @param relativePath 文件的相对路径
   * @returns 是否成功
   */
  async reloadFileFromDisk(relativePath: string): Promise<boolean> {
    if (!this.mountedWorkspace) {
      return false;
    }

    try {
      const fileResult = await window.electronAPI.pyodide.readFile(this.mountedWorkspace, relativePath);

      if (fileResult.success && fileResult.content !== undefined) {
        const memfsPath = `${this.workspaceMountPoint}/${relativePath}`;
        this.pyodide.FS.writeFile(memfsPath, fileResult.content);

        // 更新缓存
        this.fileCache.set(relativePath, {
          content: fileResult.content,
          timestamp: Date.now()
        });

        return true;
      }

      return false;
    } catch (error) {
      console.error('[PyodideFS] Failed to reload file:', error);
      return false;
    }
  }

  /**
   * 获取挂载状态
   */
  isMounted(): boolean {
    return this.mountedWorkspace !== null;
  }

  /**
   * 获取工作空间挂载点
   */
  getMountPoint(): string {
    return this.workspaceMountPoint;
  }

  /**
   * 获取已挂载的工作空间路径
   */
  getMountedWorkspace(): string | null {
    return this.mountedWorkspace;
  }

  /**
   * 获取文件列表
   */
  getFileList(): WorkspaceFile[] {
    return this.fileListCache;
  }

  /**
   * 在工作空间中搜索文件
   *
   * @param pattern 搜索模式
   * @returns 匹配的文件列表
   */
  searchFiles(pattern: string): WorkspaceFile[] {
    const regex = new RegExp(pattern, 'i');
    return this.fileListCache.filter(f =>
      regex.test(f.name) || regex.test(f.path)
    );
  }

  /**
   * 卸载工作空间
   */
  unmount(): void {
    this.mountedWorkspace = null;
    this.fileCache.clear();
    this.fileListCache = [];

    // 可选：清理 MEMFS 中的挂载点
    try {
      if (this.pyodide.FS.analyzePath(this.workspaceMountPoint).exists) {
        this.pyodide.FS.unlink(this.workspaceMountPoint);
      }
    } catch (e) {
      // 忽略清理错误
    }

    console.log('[PyodideFS] Workspace unmounted');
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): {
    fileCount: number;
    totalSize: number;
    oldestTimestamp: number;
  } {
    let totalSize = 0;
    let oldestTimestamp = Date.now();

    for (const [_path, cached] of this.fileCache) {
      totalSize += cached.content.length;
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
      }
    }

    return {
      fileCount: this.fileCache.size,
      totalSize,
      oldestTimestamp
    };
  }
}

// 导出类型
export type { PyodideInterface };
