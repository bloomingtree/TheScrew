import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, X, RefreshCw } from 'lucide-react';
import { useRightPanelStore } from '../../../store/rightPanelStore';
import { WordPreviewContent } from '../../WordPreview';

const PreviewTab: React.FC = () => {
  const { previewFiles, currentPreviewFile, setCurrentPreviewFile, clearPreviewFiles } = useRightPanelStore();
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 加载预览数据
  useEffect(() => {
    if (!currentPreviewFile) {
      setPreviewData(null);
      return;
    }

    const loadPreview = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await window.electronAPI.word.parseDocument(currentPreviewFile);
        if (result.success) {
          setPreviewData(result.data);
        } else {
          setError(result.error || '加载预览失败');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : '加载预览失败');
      } finally {
        setIsLoading(false);
      }
    };

    loadPreview();
  }, [currentPreviewFile]);

  // 移除文件
  const handleRemoveFile = (filepath: string) => {
    const { previewFiles: files } = useRightPanelStore.getState();
    if (files.length <= 1) {
      clearPreviewFiles();
    } else {
      const index = files.findIndex(f => f.filepath === filepath);
      const nextFile = files[index + 1] || files[index - 1];
      setCurrentPreviewFile(nextFile?.filepath || null);
    }
  };

  // 当前文件信息
  const currentFile = previewFiles.find(f => f.filepath === currentPreviewFile);

  if (!currentPreviewFile && previewFiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">暂无文件预览</p>
          <p className="text-xs mt-1">当大模型创建或修改文件时，会在此显示</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* 文件列表 */}
      {previewFiles.length > 0 && (
        <div className="px-4 py-2 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-2 overflow-x-auto">
            {previewFiles.map((file) => (
              <motion.button
                key={file.filepath}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setCurrentPreviewFile(file.filepath)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-all ${
                  file.filepath === currentPreviewFile
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-white text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FileText size={14} />
                <span className="max-w-[200px] truncate">{file.filename}</span>
                {previewFiles.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveFile(file.filepath);
                    }}
                    className="ml-1 hover:text-red-500"
                  >
                    <X size={12} />
                  </button>
                )}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* 预览内容 */}
      <div className="flex-1 overflow-auto">
        {isLoading && (
          <div className="h-full flex items-center justify-center">
            <div className="flex items-center gap-2 text-gray-500">
              <RefreshCw size={20} className="animate-spin" />
              <span>加载中...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-red-500">
              <p className="text-sm">{error}</p>
              <button
                onClick={() => {
                  setError(null);
                  setPreviewData(null);
                }}
                className="mt-2 text-xs underline"
              >
                重试
              </button>
            </div>
          </div>
        )}

        {!isLoading && !error && previewData && (
          <WordPreviewContent
            data={previewData}
            filepath={currentPreviewFile!}
          />
        )}

        {!isLoading && !error && !previewData && currentFile && (
          <div className="h-full flex items-center justify-center text-gray-400">
            <p className="text-sm">无法预览文件: {currentFile.filename}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PreviewTab;
