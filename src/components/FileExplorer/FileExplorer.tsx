/**
 * FileExplorer - VS Code 风格文件浏览器
 *
 * 功能：
 * - 树形文件结构展示
 * - 展开/收起文件夹
 * - 文件图标（根据扩展名）
 * - 点击文件打开编辑器
 * - 右键菜单（新建、重命名、删除等）
 * - 拖拽支持
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Plus,
  RefreshCw,
  FileText,
  Trash2,
} from 'lucide-react';
import { getIconFromPath } from '@/utils/monacoLanguages';
import { useTabStore } from '@/store/tabStore';

export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
  children?: FileEntry[];
  isExpanded?: boolean;
}

interface FileExplorerProps {
  /** 根目录路径 */
  rootPath: string;
  /** 文件点击回调 */
  onFileClick?: (path: string) => void;
  /** 右键菜单渲染器 */
  renderContextMenu?: (entry: FileEntry, position: { x: number; y: number }) => React.ReactNode;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  rootPath,
  onFileClick,
  renderContextMenu,
}) => {
  const [fileTree, setFileTree] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ entry: FileEntry; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { openTab } = useTabStore();

  // 加载文件列表
  const loadFiles = async (dirPath: string = rootPath) => {
    setLoading(true);
    setError(null);
    try {
      const result = await (window as any).electronAPI.fileEditor.listDirectory(dirPath);
      if (result.success && result.entries) {
        // 构建文件树
        const entries: FileEntry[] = result.entries.map(entry => ({
          ...entry,
          isExpanded: false,
        }));

        setFileTree(entries);
      } else {
        setError(result.error || '加载文件失败');
      }
    } catch (err: any) {
      setError(err.message || '加载文件失败');
    } finally {
      setLoading(false);
    }
  };

  // 初始化加载
  useEffect(() => {
    loadFiles();
  }, [rootPath]);

  // 加载子目录内容
  const loadChildren = async (dirPath: string) => {
    console.log('[FileExplorer] loadChildren called with dirPath:', dirPath);
    try {
      const result = await (window as any).electronAPI.fileEditor.listDirectory(dirPath);
      console.log('[FileExplorer] listDirectory result for', dirPath, ':', result);
      if (result.success && result.entries) {
        const newChildren: FileEntry[] = result.entries.map(entry => ({
          ...entry,
          isExpanded: false,
        }));
        console.log('[FileExplorer] newChildren:', newChildren.map(c => c.name));

        // 使用函数式更新，避免闭包问题
        setFileTree(prevTree => {
          const updateInChildren = (entries: FileEntry[]): FileEntry[] => {
            return entries.map(e => {
              if (e.path === dirPath) {
                console.log('[FileExplorer] Found matching path, setting children for:', e.path);
                return { ...e, children: newChildren };
              }
              if (e.children) {
                return { ...e, children: updateInChildren(e.children) };
              }
              return e;
            });
          };
          const newTree = updateInChildren(prevTree);
          console.log('[FileExplorer] Tree updated');
          return newTree;
        });
      }
    } catch (err) {
      console.error('Failed to load children:', err);
    }
  };

  // 切换文件夹展开状态
  const toggleExpand = async (entry: FileEntry) => {
    if (entry.type !== 'directory') return;
    console.log('[FileExplorer] toggleExpand called for:', entry.path);

    // 使用函数式更新，避免闭包问题
    setFileTree(prevTree => {
      const updateExpanded = (entries: FileEntry[]): FileEntry[] => {
        return entries.map(e => {
          if (e.path === entry.path) {
            const newExpanded = !e.isExpanded;
            const updated = { ...e, isExpanded: newExpanded };
            console.log('[FileExplorer] Toggling', e.name, 'to isExpanded:', newExpanded, 'hasChildren:', !!e.children);

            // 如果展开且没有子项，加载子项
            if (newExpanded && !e.children) {
              // 异步加载，不阻塞渲染
              console.log('[FileExplorer] Will loadChildren for path:', entry.path);
              loadChildren(entry.path);
            }

            return updated;
          }
          if (e.children) {
            return { ...e, children: updateExpanded(e.children) };
          }
          return e;
        });
      };
      return updateExpanded(prevTree);
    });
  };

  // 处理文件点击
  const handleFileClick = async (entry: FileEntry) => {
    if (entry.type === 'directory') {
      toggleExpand(entry);
    } else {
      // 打开编辑器标签
      openTab({
        type: 'editor',
        title: entry.name,
        content: { filepath: entry.path },
      });

      if (onFileClick) {
        onFileClick(entry.path);
      }
    }
  };

  // 处理右键菜单
  const handleContextMenu = (e: React.MouseEvent, entry: FileEntry) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ entry, x: e.clientX, y: e.clientY });
  };

  // 关闭右键菜单
  const closeContextMenu = () => {
    setContextMenu(null);
  };

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };

    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  // 删除文件/文件夹
  const handleDelete = async (entry: FileEntry) => {
    try {
      const result = await (window as any).electronAPI.fileEditor.deleteFile(entry.path);
      if (result.success) {
        // 刷新文件列表
        loadFiles();
      } else if (result.error !== '用户取消') {
        console.error('删除失败:', result.error);
      }
    } catch (err) {
      console.error('删除失败:', err);
    }
    closeContextMenu();
  };

  // 使用系统默认程序打开文件（双击效果）
  const handleOpen = async (entry: FileEntry) => {
    if (entry.type === 'file') {
      try {
        const result = await (window as any).electronAPI.fileEditor.openWithSystem(entry.path);
        if (!result.success) {
          console.error('打开文件失败:', result.error);
        }
      } catch (err) {
        console.error('打开文件失败:', err);
      }
    } else {
      // 如果是目录，展开/收起
      toggleExpand(entry);
    }
    closeContextMenu();
  };

  // 渲染文件项
  const renderFileItem = (entry: FileEntry, depth: number = 0): React.ReactNode => {
    const isDirectory = entry.type === 'directory';
    const icon = isDirectory
      ? (entry.isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />)
      : getIconFromPath(entry.path);

    return (
      <div key={entry.path}>
        {/* 文件/文件夹项 */}
        <div
          className={`flex items-center gap-2 px-2 py-1 hover:bg-gray-100 cursor-pointer select-none ${
            depth > 0 ? 'ml-4' : ''
          }`}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => handleFileClick(entry)}
          onContextMenu={(e) => handleContextMenu(e, entry)}
        >
          {/* 展开/收起图标 */}
          {isDirectory && (
            <span className="shrink-0 text-gray-400">
              {entry.isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          )}

          {/* 文件/文件夹图标 */}
          <span className="shrink-0" style={{ color: isDirectory ? '#7aa2f7' : '#c0caf5' }}>
            {icon}
          </span>

          {/* 名称 */}
          <span className="text-sm text-gray-700 truncate flex-1">
            {entry.name}
          </span>
        </div>

        {/* 子项 */}
        {isDirectory && entry.isExpanded && entry.children && (
          <div>
            {entry.children.map(child => renderFileItem(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white" onClick={closeContextMenu}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <FolderOpen size={14} className="text-gray-500" />
          <span className="text-xs font-medium text-gray-600">工作空间</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadFiles()}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            title="刷新"
            disabled={loading}
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => {/* TODO: 新建文件 */}}
            className="p-1 rounded hover:bg-gray-100 text-gray-500"
            title="新建文件"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-auto">
        {error ? (
          <div className="p-4 text-sm text-red-500">{error}</div>
        ) : fileTree.length === 0 ? (
          <div className="p-4 text-sm text-gray-400">空文件夹</div>
        ) : (
          fileTree.map(entry => renderFileItem(entry))
        )}
      </div>

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[140px] z-[9999]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {renderContextMenu ? (
            renderContextMenu(contextMenu.entry, { x: contextMenu.x, y: contextMenu.y })
          ) : (
            // 默认内置菜单
            <>
              {/* 打开文件 */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-100 text-gray-700"
                onClick={() => handleOpen(contextMenu.entry)}
              >
                <FileText size={14} />
                <span>{contextMenu.entry.type === 'directory' ? '打开文件夹' : '打开文件'}</span>
              </button>

              <div className="h-px bg-gray-200 my-1" />

              {/* 删除 */}
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-red-50 text-red-600"
                onClick={() => handleDelete(contextMenu.entry)}
              >
                <Trash2 size={14} />
                <span>删除</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default FileExplorer;
