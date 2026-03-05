import React, { useEffect, useState } from 'react';
import { FileText, RefreshCw, File } from 'lucide-react';
import { useTabStore } from '@/store/tabStore';
import { TextFilePreview, ExcelPreview, ImagePreview } from '@/components/FilePreview';
import { WordPreviewContent } from '@/components/WordPreview';

interface PreviewTabProps {
  panelId?: 'left' | 'right';
}

const PreviewTab: React.FC<PreviewTabProps> = ({ panelId = 'right' }) => {
  const { leftPanel, rightPanel } = useTabStore();
  const panel = panelId === 'left' ? leftPanel : rightPanel;

  // 获取当前活动的预览标签
  const activePreviewTab = panel.tabs.find(t => t.id === panel.activeTabId && (t.type === 'preview' || t.type === 'file'));

  const filepath = activePreviewTab?.content?.filepath;

  if (!filepath) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">暂无文件预览</p>
          <p className="text-xs mt-1">点击左侧文件进行预览</p>
        </div>
      </div>
    );
  }

  // 根据文件扩展名判断文件类型
  const getFileType = (filepath: string): 'text' | 'excel' | 'image' | 'word' | 'unknown' => {
    const ext = filepath.split('.').pop()?.toLowerCase() || '';

    const textExtensions = ['txt', 'md', 'markdown', 'json', 'xml', 'html', 'htm', 'css', 'scss', 'sass',
      'js', 'jsx', 'ts', 'tsx', 'vue', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h',
      'cs', 'go', 'rs', 'swift', 'kt', 'scala', 'groovy', 'sh', 'bash', 'zsh',
      'yaml', 'yml', 'toml', 'ini', 'conf', 'config', 'env', 'gitignore',
      'sql', 'csv', 'tsv', 'log', 'dockerfile', 'makefile', 'cmake'];

    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'];

    const excelExtensions = ['xlsx', 'xls'];
    const wordExtensions = ['docx'];

    if (textExtensions.includes(ext)) return 'text';
    if (imageExtensions.includes(ext)) return 'image';
    if (excelExtensions.includes(ext)) return 'excel';
    if (wordExtensions.includes(ext)) return 'word';

    return 'unknown';
  };

  const fileType = getFileType(filepath);

  // 渲染对应的预览组件
  const renderPreview = () => {
    switch (fileType) {
      case 'text':
        return <TextFilePreview filepath={filepath} />;
      case 'image':
        return <ImagePreview filepath={filepath} />;
      case 'excel':
        return <ExcelPreview filepath={filepath} />;
      case 'word':
        return <WordPreviewWrapper filepath={filepath} />;
      default:
        return (
          <div className="h-full flex items-center justify-center text-gray-400">
            <div className="text-center">
              <File size={48} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm">暂不支持此文件类型</p>
              <p className="text-xs mt-1 text-gray-500">{filepath}</p>
            </div>
          </div>
        );
    }
  };

  return renderPreview();
};

// Word 文档预览包装器
const WordPreviewWrapper: React.FC<{ filepath: string }> = ({ filepath }) => {
  const [previewData, setPreviewData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPreview();
  }, [filepath]);

  const loadPreview = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.word.preview(filepath);
      if (result.success && result.data) {
        setPreviewData(result.data);
      } else {
        setError(result.error || '加载预览失败');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载预览失败');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <RefreshCw size={48} className="mx-auto mb-3 opacity-50 animate-spin" />
          <p className="text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!previewData) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <FileText size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">无法预览文件</p>
        </div>
      </div>
    );
  }

  return <WordPreviewContent data={previewData} filepath={filepath} />;
};

export default PreviewTab;
