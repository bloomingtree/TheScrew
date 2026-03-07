/**
 * 附件列表组件
 * 显示已上传的附件，支持预览和删除
 */

import React from 'react';
import { motion } from 'framer-motion';
import { File, X, FileText, Image, Archive, Database, FileCode } from 'lucide-react';
import type { Attachment } from '../../types';

interface AttachmentListProps {
  attachments: Attachment[];
  onRemove: (id: string) => void;
}

/**
 * 根据文件类型获取对应图标组件
 */
function getFileIcon(fileType: Attachment['fileType']): React.ComponentType<any> {
  switch (fileType) {
    case 'image':
      return Image;
    case 'document':
      return FileText;
    case 'archive':
      return Archive;
    case 'data':
      return Database;
    default:
      return File;
  }
}

/**
 * 格式化文件大小显示
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return bytes + ' B';
  }
  if (bytes < 1024 * 1024) {
    return (bytes / 1024).toFixed(1) + ' KB';
  }
  if (bytes < 1024 * 1024 * 1024) {
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

/**
 * 获取文件类型颜色
 */
function getFileTypeColor(fileType: Attachment['fileType']): string {
  switch (fileType) {
    case 'image':
      return 'text-green-600 bg-green-50';
    case 'document':
      return 'text-blue-600 bg-blue-50';
    case 'archive':
      return 'text-orange-600 bg-orange-50';
    case 'data':
      return 'text-purple-600 bg-purple-50';
    default:
      return 'text-gray-600 bg-gray-50';
  }
}

const AttachmentList: React.FC<AttachmentListProps> = ({ attachments, onRemove }) => {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex flex-wrap gap-2">
      {attachments.map((attachment) => {
        const Icon = getFileIcon(attachment.fileType);
        const colorClass = getFileTypeColor(attachment.fileType);
        const hasContent = !!attachment.extractedContent;
        const isProcessing = attachment.status === 'processing';
        const hasError = attachment.status === 'error';

        return (
          <motion.div
            key={attachment.id}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className={`relative inline-flex items-center gap-2 px-3 py-2 rounded-lg border shadow-sm ${colorClass} border-opacity-30 hover:shadow-md transition-shadow`}
          >
            {/* 文件类型图标 */}
            <div className="flex-shrink-0">
              <Icon size={16} className="opacity-80" />
            </div>

            {/* 文件信息 */}
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium truncate max-w-[150px]" title={attachment.fileName}>
                {attachment.fileName}
              </span>
              <div className="flex items-center gap-2 text-xs opacity-70">
                <span>{formatFileSize(attachment.fileSize)}</span>
                {isProcessing && (
                  <span className="text-blue-600 animate-pulse">处理中...</span>
                )}
                {hasError && (
                  <span className="text-red-600" title={attachment.error}>错误</span>
                )}
              </div>
            </div>

            {/* 内容已提取标记 */}
            {hasContent && !isProcessing && !hasError && (
              <div className="flex-shrink-0 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
                <span className="text-white text-xs leading-none">✓</span>
              </div>
            )}

            {/* 删除按钮 */}
            <button
              onClick={() => onRemove(attachment.id)}
              className="flex-shrink-0 ml-1 p-1 rounded-full hover:bg-red-100 hover:text-red-600 transition-colors"
              title="移除附件"
            >
              <X size={12} />
            </button>
          </motion.div>
        );
      })}
    </div>
  );
};

export default AttachmentList;
