import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Table, Presentation, Image, FileCode, File } from 'lucide-react';

export interface PendingFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: 'image' | 'document' | 'code' | 'data' | 'other';
  savedPath: string;
  status: 'saving' | 'ready' | 'error';
}

interface FilePreviewBarProps {
  files: PendingFile[];
  onRemove: (id: string) => void;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  image: Image,
  document: FileText,
  code: FileCode,
  data: Table,
  other: File,
};

const FILE_COLORS: Record<string, string> = {
  image: 'text-purple-500 bg-purple-50',
  document: 'text-blue-500 bg-blue-50',
  code: 'text-green-500 bg-green-50',
  data: 'text-orange-500 bg-orange-50',
  other: 'text-gray-500 bg-gray-50',
};

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FilePreviewBar: React.FC<FilePreviewBarProps> = ({ files, onRemove }) => {
  if (files.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        <AnimatePresence>
          {files.map((file) => {
            const Icon = FILE_ICONS[file.fileType] || File;
            const colorClass = FILE_COLORS[file.fileType] || FILE_COLORS.other;

            return (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex-shrink-0 relative group"
              >
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200/60 bg-white/80 ${file.status === 'error' ? 'border-red-300' : ''}`}>
                  <div className={`w-8 h-8 rounded-md flex items-center justify-center ${colorClass}`}>
                    <Icon size={16} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-700 truncate max-w-[100px]">
                      {file.fileName}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {file.status === 'saving' ? '保存中...' :
                       file.status === 'error' ? '保存失败' :
                       formatSize(file.fileSize)}
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(file.id)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded-full hover:bg-gray-200/50 text-gray-400 hover:text-gray-600"
                  >
                    <X size={12} />
                  </button>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default FilePreviewBar;
