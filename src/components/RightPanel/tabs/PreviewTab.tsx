import React from 'react';
import { FileText, File } from 'lucide-react';
import { useTabStore } from '@/store/tabStore';
import { TextFilePreview, ExcelPreview, ImagePreview, WordPreview, PPTXPreview, PDFPreview } from '@/components/FilePreview';

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
  const getFileType = (filepath: string): 'text' | 'excel' | 'image' | 'word' | 'pptx' | 'pdf' | 'unknown' => {
    const ext = filepath.split('.').pop()?.toLowerCase() || '';

    const textExtensions = ['txt', 'md', 'markdown', 'json', 'xml', 'html', 'htm', 'css', 'scss', 'sass',
      'js', 'jsx', 'ts', 'tsx', 'vue', 'py', 'rb', 'php', 'java', 'c', 'cpp', 'h',
      'cs', 'go', 'rs', 'swift', 'kt', 'scala', 'groovy', 'sh', 'bash', 'zsh',
      'yaml', 'yml', 'toml', 'ini', 'conf', 'config', 'env', 'gitignore',
      'sql', 'csv', 'tsv', 'log', 'dockerfile', 'makefile', 'cmake'];

    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp', 'svg', 'ico'];

    const excelExtensions = ['xlsx', 'xls'];
    const wordExtensions = ['docx'];
    const pptxExtensions = ['pptx'];
    const pdfExtensions = ['pdf'];

    if (textExtensions.includes(ext)) return 'text';
    if (imageExtensions.includes(ext)) return 'image';
    if (excelExtensions.includes(ext)) return 'excel';
    if (wordExtensions.includes(ext)) return 'word';
    if (pptxExtensions.includes(ext)) return 'pptx';
    if (pdfExtensions.includes(ext)) return 'pdf';

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
        return <WordPreview filepath={filepath} />;
      case 'pptx':
        return <PPTXPreview filepath={filepath} />;
      case 'pdf':
        return <PDFPreview filepath={filepath} />;
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

export default PreviewTab;
