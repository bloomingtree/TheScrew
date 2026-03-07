/**
 * ContextMenu - 文件浏览器右键菜单
 *
 * 提供文件和文件夹的右键操作：
 * - 新建文件/文件夹
 * - 重命名
 * - 删除
 * - 复制路径
 */

import React, { useRef, useEffect } from 'react';
import {
  FilePlus,
  FolderPlus,
  Edit,
  Trash2,
  Copy,
  Download,
  ChevronRight,
} from 'lucide-react';
import { FileEntry } from './FileExplorer';

interface ContextMenuItem {
  label: string;
  icon?: React.ElementType;
  action?: () => void;
  disabled?: boolean;
  children?: ContextMenuItem[];
}

interface FileExplorerContextMenuProps {
  /** 选中的文件项 */
  entry: FileEntry;
  /** 关闭菜单回调 */
  onClose: () => void;
  /** 新建文件回调 */
  onNewFile?: (parentPath: string) => void;
  /** 新建文件夹回调 */
  onNewFolder?: (parentPath: string) => void;
  /** 重命名回调 */
  onRename?: (entry: FileEntry) => void;
  /** 删除回调 */
  onDelete?: (entry: FileEntry) => void;
  /** 复制路径回调 */
  onCopyPath?: (path: string) => void;
  /** 下载回调 */
  onDownload?: (entry: FileEntry) => void;
}

const FileExplorerContextMenu: React.FC<FileExplorerContextMenuProps> = ({
  entry,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
  onCopyPath,
  onDownload,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const isDirectory = entry.type === 'directory';

  // 构建菜单项
  const menuItems: ContextMenuItem[] = [];

  // 新建项（仅在目录中显示）
  if (isDirectory) {
    menuItems.push({
      label: '新建文件',
      icon: FilePlus,
      action: () => onNewFile?.(entry.path),
    });
    menuItems.push({
      label: '新建文件夹',
      icon: FolderPlus,
      action: () => onNewFolder?.(entry.path),
    });
    menuItems.push({ label: '-' }); // 分隔符
  }

  // 基本操作
  menuItems.push({
    label: '重命名',
    icon: Edit,
    action: () => onRename?.(entry),
  });

  menuItems.push({
    label: '删除',
    icon: Trash2,
    action: () => onDelete?.(entry),
  });

  menuItems.push({ label: '-' }); // 分隔符

  // 其他操作
  menuItems.push({
    label: '复制路径',
    icon: Copy,
    action: () => onCopyPath?.(entry.path),
  });

  if (!isDirectory) {
    menuItems.push({
      label: '下载',
      icon: Download,
      action: () => onDownload?.(entry),
    });
  }

  // 渲染菜单项
  const renderMenuItem = (item: ContextMenuItem, index: number) => {
    if (item.label === '-') {
      return <div key={index} className="h-px bg-gray-200 my-1" />;
    }

    const Icon = item.icon;

    return (
      <button
        key={index}
        className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed ${
          item.disabled ? 'text-gray-400' : 'text-gray-700'
        }`}
        onClick={() => {
          if (!item.disabled) {
            item.action();
            onClose();
          }
        }}
        disabled={item.disabled}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} />}
          <span>{item.label}</span>
        </div>
        {item.children && <ChevronRight size={12} className="text-gray-400" />}
      </button>
    );
  };

  return (
    <div
      ref={menuRef}
      className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 min-w-[180px] z-50"
    >
      {menuItems.map((item, index) => renderMenuItem(item, index))}
    </div>
  );
};

export default FileExplorerContextMenu;
