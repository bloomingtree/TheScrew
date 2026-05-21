import React, { useState, useEffect } from 'react';
import { Presentation, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, Image, FileText } from 'lucide-react';

interface PPTXPreviewProps {
  filepath: string;
}

interface PPTXSlide {
  index: number;
  title: string;
  content: string[];
  notes: string;
  hasImages: boolean;
}

interface PPTXPreviewData {
  filepath: string;
  slides: PPTXSlide[];
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    slideCount: number;
    title?: string;
    author?: string;
  };
}

const PPTXPreview: React.FC<PPTXPreviewProps> = ({ filepath }) => {
  const [data, setData] = useState<PPTXPreviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [showThumbnails, setShowThumbnails] = useState(true);

  useEffect(() => {
    loadFile();
  }, [filepath]);

  const loadFile = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.pptx.preview(filepath);
      if (result.success && result.data) {
        setData(result.data);
        setActiveSlide(0);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const formatDate = (dateStr?: string): string => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  const goToSlide = (index: number) => {
    if (data && index >= 0 && index < data.slides.length) {
      setActiveSlide(index);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <RefreshCw size={48} className="mx-auto mb-3 opacity-50 animate-spin" />
          <p className="text-sm">正在加载演示文稿...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Presentation size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={loadFile} className="mt-3 text-xs text-blue-500 hover:underline">重试</button>
        </div>
      </div>
    );
  }

  if (!data || data.slides.length === 0) return null;

  const currentSlide = data.slides[activeSlide];

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Presentation size={16} className="text-orange-600" />
          <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
            {filepath.split(/[/\\]/).pop()}
          </span>
          <span className="text-xs text-gray-500">
            {data.slides.length} 页 · {formatFileSize(data.metadata.size)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowThumbnails(!showThumbnails)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              showThumbnails ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            缩略图
          </button>
          <button
            onClick={() => window.electronAPI.fileEditor.openWithSystem(filepath)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded text-gray-600 hover:bg-gray-200 transition-colors"
          >
            <ExternalLink size={14} />
            打开
          </button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 缩略图侧边栏 */}
        {showThumbnails && (
          <div className="w-36 border-r border-gray-200 bg-gray-50 overflow-y-auto flex-shrink-0 p-2 space-y-2">
            {data.slides.map((slide, idx) => (
              <button
                key={slide.index}
                onClick={() => setActiveSlide(idx)}
                className={`w-full text-left rounded-lg border-2 transition-all ${
                  activeSlide === idx
                    ? 'border-orange-500 bg-white shadow-sm'
                    : 'border-transparent bg-white hover:border-gray-300'
                }`}
              >
                {/* 缩略图占位 */}
                <div className={`aspect-[16/9] rounded-t-md flex items-center justify-center text-xs ${
                  activeSlide === idx ? 'bg-orange-50' : 'bg-gray-100'
                }`}>
                  <div className="text-center px-2">
                    {slide.hasImages ? (
                      <Image size={16} className="mx-auto mb-1 text-gray-400" />
                    ) : (
                      <FileText size={16} className="mx-auto mb-1 text-gray-400" />
                    )}
                    <span className="text-[10px] text-gray-400 line-clamp-2">{slide.title}</span>
                  </div>
                </div>
                <div className="px-2 py-1 text-[10px] text-gray-500 text-center">
                  {idx + 1}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* 幻灯片内容 */}
        <div className="flex-1 flex flex-col">
          {/* 幻灯片内容区 */}
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-[700px] mx-auto">
              {/* 模拟幻灯片卡片 */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm aspect-[16/9] flex flex-col p-8">
                {/* 标题 */}
                <h2 className="text-xl font-bold text-gray-800 mb-4">
                  {currentSlide.title}
                </h2>
                {/* 内容 */}
                <div className="flex-1 space-y-2 overflow-y-auto">
                  {currentSlide.content.length > 1 ? (
                    <ul className="space-y-1.5">
                      {currentSlide.content.slice(1).map((text, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" />
                          {text}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500 italic">
                      {currentSlide.content.length === 0 ? '（空幻灯片）' : ''}
                    </p>
                  )}
                </div>
                {currentSlide.hasImages && (
                  <div className="mt-3 text-xs text-gray-400 flex items-center gap-1">
                    <Image size={12} />
                    包含图片
                  </div>
                )}
              </div>

              {/* 备注 */}
              {currentSlide.notes && (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="text-xs font-semibold text-yellow-700 mb-1">演讲者备注</div>
                  <p className="text-xs text-yellow-800 whitespace-pre-wrap">{currentSlide.notes}</p>
                </div>
              )}
            </div>
          </div>

          {/* 幻灯片导航 */}
          <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0">
            <button
              onClick={() => goToSlide(activeSlide - 1)}
              disabled={activeSlide === 0}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-gray-600 min-w-[80px] text-center">
              {activeSlide + 1} / {data.slides.length}
            </span>
            <button
              onClick={() => goToSlide(activeSlide + 1)}
              disabled={activeSlide === data.slides.length - 1}
              className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>PowerPoint 演示文稿</span>
          {data.metadata.author && <span>作者: {data.metadata.author}</span>}
        </div>
        <div className="flex items-center gap-4">
          <span>{formatDate(data.metadata.modified)}</span>
        </div>
      </div>
    </div>
  );
};

export default PPTXPreview;
