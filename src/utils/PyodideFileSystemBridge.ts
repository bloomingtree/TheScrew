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
 * 文件缓存条目
 */
export interface FileCacheEntry {
  content: string;
  timestamp: number;
  encoding?: 'utf-8' | 'base64';
}

/**
 * 挂载点配置
 */
export interface MountPointConfig {
  /** 挂载点名称 */
  name: string;
  /** Pyodide 中的挂载路径 */
  mountPath: string;
  /** 本地文件系统路径 */
  localPath: string;
  /** 挂载点类型 */
  type: 'workspace' | 'config' | 'scripts' | 'custom';
  /** 桥接选项 */
  options?: BridgeOptions;
  /** 是否已挂载 */
  mounted: boolean;
}

/**
 * Pyodide 文件系统桥接器
 *
 * 支持多挂载点：可以将多个本地目录挂载到 Pyodide 的虚拟文件系统中
 *
 * 工作原理：
 * 1. 通过 registerMountPoint() 注册多个挂载点
 * 2. 通过 mountAll() 或 mountPoint() 挂载所有或单个挂载点
 * 3. Python 代码可以通过 /workspace, /config 等路径访问不同的目录
 * 4. 修改的文件通过 IPC 写回本地文件系统
 */
export class PyodideFileSystemBridge {
  private pyodide: PyodideInterface;
  /** 挂载点配置表 */
  private mountPoints: Map<string, MountPointConfig> = new Map();
  /** 每个挂载点独立的文件缓存 */
  private fileCaches: Map<string, Map<string, FileCacheEntry>> = new Map();
  /** 每个挂载点独立的文件列表缓存 */
  private fileListCaches: Map<string, WorkspaceFile[]> = new Map();

  constructor(pyodide: PyodideInterface) {
    this.pyodide = pyodide;
  }

  // ============================================================================
  // 挂载点管理
  // ============================================================================

  /**
   * 注册一个挂载点
   *
   * @param name 挂载点名称（如 'workspace', 'config'）
   * @param localPath 本地文件系统路径
   * @param type 挂载点类型
   * @param options 桥接选项
   */
  registerMountPoint(
    name: string,
    localPath: string,
    type: MountPointConfig['type'] = 'custom',
    options?: BridgeOptions
  ): void {
    const mountPath = `/${name}`;
    this.mountPoints.set(name, {
      name,
      mountPath,
      localPath,
      type,
      options,
      mounted: false
    });
    this.fileCaches.set(name, new Map());
    this.fileListCaches.set(name, []);
    console.log(`[PyodideFS] Registered mount point: ${name} -> ${localPath}`);
  }

  /**
   * 获取所有已注册的挂载点
   */
  getMountPoints(): MountPointConfig[] {
    return Array.from(this.mountPoints.values());
  }

  /**
   * 获取指定挂载点的配置
   */
  getMountPoint(name: string): MountPointConfig | undefined {
    return this.mountPoints.get(name);
  }

  /**
   * 挂载单个挂载点到 Pyodide 文件系统
   *
   * @param name 挂载点名称
   * @returns 是否成功挂载
   */
  async mountPoint(name: string): Promise<boolean> {
    const config = this.mountPoints.get(name);
    if (!config) {
      console.error(`[PyodideFS] Mount point '${name}' not registered`);
      return false;
    }

    if (config.mounted) {
      console.log(`[PyodideFS] Mount point '${name}' already mounted`);
      return true;
    }

    try {
      console.log(`[PyodideFS] Mounting ${name}:`, config.localPath);
      console.log(`[PyodideFS] Mount path:`, config.mountPath);

      // 1. 创建挂载点目录
      try {
        this.pyodide.FS.mkdirTree(config.mountPath);
        const mountPointExists = this.pyodide.FS.analyzePath(config.mountPath).exists;
        console.log(`[PyodideFS] Mount point created/exists:`, config.mountPath, mountPointExists);
      } catch (e) {
        console.error(`[PyodideFS] Failed to create mount point:`, config.mountPath, e);
        return false;
      }

      // 2. 从 Main 进程获取文件列表
      const fileList = await window.electronAPI.pyodide.listFiles(config.localPath);

      if (!fileList.success || !fileList.files) {
        throw new Error(fileList.error || 'Failed to list files');
      }

      // 3. 过滤文件
      const files = this.filterFiles(fileList.files, config.options);
      this.fileListCaches.set(name, files);

      // 4. 在 MEMFS 中加载文件
      let fileCount = 0;
      let totalSize = 0;

      for (const file of files) {
        const memfsPath = `${config.mountPath}/${file.path}`;

        if (file.type === 'directory') {
          // 创建目录
          try {
            this.pyodide.FS.mkdirTree(memfsPath);
          } catch (e) {
            // 目录可能已存在，忽略错误
          }
        } else {
          // 读取文件内容
          const fileResult = await window.electronAPI.pyodide.readFile(config.localPath, file.path);

          if (fileResult.success && fileResult.content !== undefined) {
            // 创建目录（如果需要）
            const dirPath = memfsPath.substring(0, memfsPath.lastIndexOf('/'));
            if (dirPath && dirPath !== config.mountPath) {
              try {
                this.pyodide.FS.mkdirTree(dirPath);
              } catch (e) {
                // 目录可能已存在
              }
            }

            // 写入文件到 MEMFS
            try {
              let dataToWrite: string | Uint8Array;

              if (fileResult.encoding === 'base64') {
                // 二进制文件：从 base64 解码为 Uint8Array
                const binaryString = atob(fileResult.content);
                dataToWrite = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  dataToWrite[i] = binaryString.charCodeAt(i);
                }
              } else {
                // 文本文件：直接使用字符串
                dataToWrite = fileResult.content;
              }

              this.pyodide.FS.writeFile(memfsPath, dataToWrite);

              // 缓存文件内容（保持原始编码）
              const cache = this.fileCaches.get(name)!;
              cache.set(file.path, {
                content: fileResult.content,
                timestamp: Date.now(),
                encoding: fileResult.encoding
              });

              fileCount++;
              if (file.size) {
                totalSize += file.size;
              }
            } catch (e) {
              console.warn(`[PyodideFS] Failed to write file: ${memfsPath}`, e);
              console.warn(`[PyodideFS] Error details:`, {
                name: (e as any)?.name,
                message: (e as any)?.message,
                errno: (e as any)?.errno,
                encoding: fileResult.encoding,
                contentLength: fileResult.content?.length
              });
            }
          }
        }
      }

      // 标记为已挂载
      config.mounted = true;

      console.log(`[PyodideFS] Mount point '${name}' mounted successfully`);
      console.log(`[PyodideFS] Files: ${fileCount}, Size: ${(totalSize / 1024).toFixed(2)} KB`);

      return true;
    } catch (error) {
      console.error(`[PyodideFS] Failed to mount '${name}':`, error);
      return false;
    }
  }

  /**
   * 挂载所有已注册的挂载点
   *
   * @returns 是否全部成功挂载
   */
  async mountAll(): Promise<boolean> {
    console.log(`[PyodideFS] Mounting all ${this.mountPoints.size} mount points...`);

    let allSuccess = true;
    for (const [name] of this.mountPoints) {
      const success = await this.mountPoint(name);
      if (!success) {
        allSuccess = false;
      }
    }

    console.log(`[PyodideFS] All mount points processed. Success: ${allSuccess}`);
    return allSuccess;
  }

  /**
   * 从指定挂载点读取文件
   *
   * @param mountName 挂载点名称
   * @param relativePath 相对路径
   * @returns 文件内容（字符串）
   */
  async readFileFromMount(mountName: string, relativePath: string): Promise<string> {
    const mount = this.mountPoints.get(mountName);
    if (!mount) {
      throw new Error(`Mount point '${mountName}' not found`);
    }
    if (!mount.mounted) {
      throw new Error(`Mount point '${mountName}' is not mounted`);
    }
    const memfsPath = `${mount.mountPath}/${relativePath}`;
    return this.pyodide.FS.readFile(memfsPath, { encoding: 'utf8' });
  }

  /**
   * 写入文件到指定挂载点
   *
   * @param mountName 挂载点名称
   * @param relativePath 相对路径
   * @param content 文件内容
   * @param encoding 编码（可选）
   */
  async writeFileToMount(
    mountName: string,
    relativePath: string,
    content: string,
    encoding?: 'utf-8' | 'base64'
  ): Promise<void> {
    const mount = this.mountPoints.get(mountName);
    if (!mount) {
      throw new Error(`Mount point '${mountName}' not found`);
    }
    if (!mount.mounted) {
      throw new Error(`Mount point '${mountName}' is not mounted`);
    }
    const memfsPath = `${mount.mountPath}/${relativePath}`;

    let dataToWrite: string | Uint8Array;
    if (encoding === 'base64') {
      const binaryString = atob(content);
      dataToWrite = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        dataToWrite[i] = binaryString.charCodeAt(i);
      }
    } else {
      dataToWrite = content;
    }

    this.pyodide.FS.writeFile(memfsPath, dataToWrite);

    // 更新缓存
    const cache = this.fileCaches.get(mountName)!;
    cache.set(relativePath, {
      content,
      timestamp: Date.now(),
      encoding: encoding
    });
  }

  /**
   * 挂载工作空间到 Pyodide 文件系统（向后兼容方法）
   *
   * @param workspacePath 本地工作空间路径
   * @param options 桥接选项
   * @returns 是否成功挂载
   */
  async mountWorkspace(workspacePath: string, options: BridgeOptions = {}): Promise<boolean> {
    // 向后兼容：自动注册 workspace 挂载点
    if (!this.mountPoints.has('workspace')) {
      this.registerMountPoint('workspace', workspacePath, 'workspace', options);
    } else {
      // 更新已存在的 workspace 挂载点路径
      const config = this.mountPoints.get('workspace')!;
      config.localPath = workspacePath;
      if (options) {
        config.options = options;
      }
    }
    return this.mountPoint('workspace');
  }

  /**
   * 挂载工作空间和配置目录（简化方法）
   *
   * @param workspacePath 工作空间路径
   * @param configPath 配置目录路径（.zero-employee）
   * @param options 桥接选项
   * @returns 是否成功挂载
   */
  async mountWorkspaceAndConfig(
    workspacePath: string,
    configPath?: string,
    options: BridgeOptions = {}
  ): Promise<boolean> {
    try {
      // 注册并挂载 workspace
      if (!this.mountPoints.has('workspace')) {
        this.registerMountPoint('workspace', workspacePath, 'workspace', options);
      } else {
        // 更新路径
        const config = this.mountPoints.get('workspace')!;
        config.localPath = workspacePath;
      }

      await this.mountPoint('workspace');

      // 注册并挂载 config（如果提供）
      if (configPath) {
        if (!this.mountPoints.has('config')) {
          this.registerMountPoint('config', configPath, 'config', options);
        } else {
          const config = this.mountPoints.get('config')!;
          config.localPath = configPath;
        }
        await this.mountPoint('config');
      }

      return true;
    } catch (error) {
      console.error('[PyodideFS] Failed to mount workspace and config:', error);
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
   * @param memfsPath MEMFS 中的文件路径（如 /workspace/test.py 或 /config/settings.json）
   * @returns 同步结果
   */
  async syncFileToDisk(memfsPath: string): Promise<SyncResult> {
    try {
      // 解析挂载点名称和相对路径
      const parts = memfsPath.split('/');
      const mountName = parts[1]; // /workspace/xxx -> workspace
      const relativePath = parts.slice(2).join('/'); // xxx

      const mount = this.mountPoints.get(mountName);
      if (!mount) {
        return { success: false, error: `Mount point '${mountName}' not found` };
      }
      if (!mount.mounted) {
        return { success: false, error: `Mount point '${mountName}' is not mounted` };
      }

      // 获取缓存
      const cache = this.fileCaches.get(mountName);
      if (!cache) {
        return { success: false, error: `No cache for mount point '${mountName}'` };
      }

      // 检查缓存的编码类型
      const cached = cache.get(relativePath);
      const encoding = cached?.encoding;

      // 读取文件内容
      let content: string;
      try {
        if (encoding === 'base64') {
          // 二进制文件：从 MEMFS 读取为 Uint8Array，然后转换为 base64
          const data = this.pyodide.FS.readFile(memfsPath, { encoding: 'binary' }) as Uint8Array;
          // 转换 Uint8Array 为 base64
          const binaryString = String.fromCharCode.apply(null, Array.from(data));
          content = btoa(binaryString);
        } else {
          // 文本文件：读取为 UTF-8 字符串
          content = this.pyodide.FS.readFile(memfsPath, { encoding: 'utf8' });
        }
      } catch (error: any) {
        return { success: false, error: `Failed to read file: ${error.message}` };
      }

      // 通过 IPC 写入本地文件（传递编码参数）
      const result = await window.electronAPI.pyodide.writeFile(
        mount.localPath,
        relativePath,
        content,
        encoding
      );

      if (result.success) {
        // 更新缓存
        cache.set(relativePath, {
          content,
          timestamp: Date.now(),
          encoding: encoding
        });

        return { success: true, path: `${mountName}/${relativePath}` };
      }

      return result;
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 同步指定挂载点的所有修改的文件到本地文件系统
   *
   * @param mountName 挂载点名称，如果为空则同步所有挂载点
   * @returns 同步结果列表
   */
  async syncAllToDisk(mountName?: string): Promise<SyncResult[]> {
    const results: SyncResult[] = [];

    const mountsToSync = mountName
      ? [this.mountPoints.get(mountName)].filter(Boolean) as MountPointConfig[]
      : Array.from(this.mountPoints.values());

    for (const mount of mountsToSync) {
      if (!mount.mounted) {
        results.push({ success: false, error: `Mount point '${mount.name}' is not mounted` });
        continue;
      }

      const cache = this.fileCaches.get(mount.name);
      if (!cache) {
        continue;
      }

      // 遍历该挂载点的所有文件并同步
      for (const [relativePath, cached] of cache) {
        const memfsPath = `${mount.mountPath}/${relativePath}`;

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
            path: `${mount.name}/${relativePath}`,
            error: 'File not found in MEMFS'
          });
        }
      }
    }

    return results;
  }

  /**
   * 从本地文件系统重新加载文件到 MEMFS
   *
   * @param mountName 挂载点名称（向后兼容：如果传入路径格式，自动解析）
   * @param relativePath 文件的相对路径
   * @returns 是否成功
   */
  async reloadFileFromDisk(mountName: string, relativePath?: string): Promise<boolean> {
    // 向后兼容：如果只传入一个参数且包含 /，解析为挂载点+路径
    if (relativePath === undefined && mountName.includes('/')) {
      const parts = mountName.split('/');
      const actualMountName = parts[0]; // workspace/xxx -> workspace
      relativePath = parts.slice(1).join('/'); // xxx
      mountName = actualMountName;
    }

    const mount = this.mountPoints.get(mountName);
    if (!mount || !mount.mounted) {
      return false;
    }

    try {
      const fileResult = await window.electronAPI.pyodide.readFile(mount.localPath, relativePath!);

      if (fileResult.success && fileResult.content !== undefined) {
        const memfsPath = `${mount.mountPath}/${relativePath}`;

        let dataToWrite: string | Uint8Array;

        if (fileResult.encoding === 'base64') {
          // 二进制文件：从 base64 解码为 Uint8Array
          const binaryString = atob(fileResult.content);
          dataToWrite = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            dataToWrite[i] = binaryString.charCodeAt(i);
          }
        } else {
          // 文本文件：直接使用字符串
          dataToWrite = fileResult.content;
        }

        this.pyodide.FS.writeFile(memfsPath, dataToWrite);

        // 更新缓存（保持编码）
        const cache = this.fileCaches.get(mountName)!;
        cache.set(relativePath!, {
          content: fileResult.content,
          timestamp: Date.now(),
          encoding: fileResult.encoding
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
   * 获取挂载状态（向后兼容：检查 workspace 是否挂载）
   */
  isMounted(): boolean {
    const workspaceMount = this.mountPoints.get('workspace');
    return workspaceMount ? workspaceMount.mounted : false;
  }

  /**
   * 获取工作空间挂载点（向后兼容）
   */
  getMountPoint(): string {
    const workspaceMount = this.mountPoints.get('workspace');
    return workspaceMount ? workspaceMount.mountPath : '/workspace';
  }

  /**
   * 获取已挂载的工作空间路径（向后兼容）
   */
  getMountedWorkspace(): string | null {
    const workspaceMount = this.mountPoints.get('workspace');
    return workspaceMount && workspaceMount.mounted ? workspaceMount.localPath : null;
  }

  /**
   * 获取文件列表（向后兼容：获取 workspace 的文件列表）
   */
  getFileList(): WorkspaceFile[] {
    const workspaceCache = this.fileListCaches.get('workspace');
    return workspaceCache || [];
  }

  /**
   * 在工作空间中搜索文件（向后兼容：搜索 workspace）
   *
   * @param pattern 搜索模式
   * @returns 匹配的文件列表
   */
  searchFiles(pattern: string): WorkspaceFile[] {
    const workspaceFiles = this.fileListCaches.get('workspace');
    if (!workspaceFiles) {
      return [];
    }
    const regex = new RegExp(pattern, 'i');
    return workspaceFiles.filter(f =>
      regex.test(f.name) || regex.test(f.path)
    );
  }

  /**
   * 卸载指定挂载点
   *
   * @param name 挂载点名称，如果为空则卸载 workspace（向后兼容）
   */
  unmount(name?: string): void {
    const mountName = name || 'workspace';
    const mount = this.mountPoints.get(mountName);

    if (mount) {
      mount.mounted = false;
      this.fileCaches.get(mountName)?.clear();
      this.fileListCaches.set(mountName, []);

      // 可选：清理 MEMFS 中的挂载点
      try {
        if (this.pyodide.FS.analyzePath(mount.mountPath).exists) {
          this.pyodide.FS.unlink(mount.mountPath);
        }
      } catch (e) {
        // 忽略清理错误
      }

      console.log(`[PyodideFS] Mount point '${mountName}' unmounted`);
    }
  }

  /**
   * 卸载所有挂载点
   */
  unmountAll(): void {
    for (const [name] of this.mountPoints) {
      this.unmount(name);
    }
  }

  /**
   * 获取缓存统计（向后兼容：获取 workspace 的缓存统计）
   */
  getCacheStats(): {
    fileCount: number;
    totalSize: number;
    oldestTimestamp: number;
  } {
    const cache = this.fileCaches.get('workspace');
    if (!cache) {
      return { fileCount: 0, totalSize: 0, oldestTimestamp: Date.now() };
    }

    let totalSize = 0;
    let oldestTimestamp = Date.now();

    for (const [_path, cached] of cache) {
      totalSize += cached.content.length;
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
      }
    }

    return {
      fileCount: cache.size,
      totalSize,
      oldestTimestamp
    };
  }

  /**
   * 获取指定挂载点的缓存统计
   *
   * @param name 挂载点名称
   */
  getMountCacheStats(name: string): {
    fileCount: number;
    totalSize: number;
    oldestTimestamp: number;
  } | null {
    const cache = this.fileCaches.get(name);
    if (!cache) {
      return null;
    }

    let totalSize = 0;
    let oldestTimestamp = Date.now();

    for (const [_path, cached] of cache) {
      totalSize += cached.content.length;
      if (cached.timestamp < oldestTimestamp) {
        oldestTimestamp = cached.timestamp;
      }
    }

    return {
      fileCount: cache.size,
      totalSize,
      oldestTimestamp
    };
  }
}

// 导出类型
export type { PyodideInterface };
