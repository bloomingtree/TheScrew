import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { HardDrive, File, Folder, RefreshCw, FileText, Table, Image as ImageIcon } from 'lucide-react';
import { useRightPanelStore } from '../../../store/rightPanelStore';

interface WorkspaceFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
}

const FilesTab: React.FC = () => {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { openPreview } = useRightPanelStore();

  const loadFiles = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.workspace.listFiles();
      if (result.success && result.files) {
        // 类型转换：确保 type 字段是正确的类型
        const typedFiles: WorkspaceFile[] = result.files.map(file => ({
          ...file,
          type: file.type as 'file' | 'directory',
        }));
        setFiles(typedFiles);
      } else {
        setError(result.error || '加载文件列表失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载文件列表失败');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadFiles();
  }, []);

  // 获取文件图标
  const getFileIcon = (file: WorkspaceFile) => {
    if (file.type === 'directory') {
      return <Folder size={16} className="text-yellow-500" />;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'docx':
        return <FileText size={16} className="text-blue-500" />;
      case 'xlsx':
        return <Table size={16} className="text-green-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        return <ImageIcon size={16} className="text-purple-500" />;
      default:
        return <File size={16} className="text-gray-500" />;
    }
  };

  // 格式化文件大小
  const formatSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  // 处理文件点击
  const handleFileClick = (file: WorkspaceFile) => {
    if (file.type === 'directory') return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'docx') {
      openPreview(file.path);
    }
  };

  if (isLoading && files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <RefreshCw size={20} className="animate-spin" />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  if (error && files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center text-red-500">
          <HardDrive size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">{error}</p>
          <button
            onClick={loadFiles}
            className="mt-2 text-xs underline"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <HardDrive size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">工作空间为空</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <span className="text-sm text-gray-600">工作空间文件</span>
        <button
          onClick={loadFiles}
          className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-500"
          title="刷新"
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* 文件列表 */}
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">名称</th>
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-600">类型</th>
              <th className="px-4 py-2 text-right text-xs font-semibold text-gray-600">大小</th>
            </tr>
          </thead>
          <tbody>
            {files.map((file, index) => (
              <motion.tr
                key={file.path}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
                onClick={() => handleFileClick(file)}
                className={`border-b border-gray-100 hover:bg-blue-50 transition-colors cursor-pointer ${
                  file.type === 'file' && file.name.endsWith('.docx') ? 'hover:bg-blue-50' : ''
                }`}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {getFileIcon(file)}
                    <span className="text-sm text-gray-800 truncate max-w-[200px]" title={file.name}>
                      {file.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <span className="text-xs text-gray-500">
                    {file.type === 'directory' ? '文件夹' : '文件'}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <span className="text-xs text-gray-500">{formatSize(file.size)}</span>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default FilesTab;
