import React, { useState, useEffect } from 'react';
import { Image, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface ImagePreviewProps {
  filepath: string;
}

interface ImageData {
  filepath: string;
  base64: string;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    width?: number;
    height?: number;
    extension: string;
  };
}

const ImagePreview: React.FC<ImagePreviewProps> = ({ filepath }) => {
  const [data, setData] = useState<ImageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    loadImage();
  }, [filepath]);

  const loadImage = async () => {
    setLoading(true);
    setError(null);
    setScale(1);
    setRotation(0);
    try {
      const result = await window.electronAPI.filePreview.preview(filepath);
      if (result.success && result.data) {
        setData(result.data);
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

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };

  // 获取图片尺寸
  const getImageDimensions = () => {
    if (!data) return { width: 0, height: 0 };
    // 如果元数据中有尺寸，使用它；否则使用默认值
    return {
      width: data.metadata.width || 0,
      height: data.metadata.height || 0,
    };
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 bg-gray-900">
        <div className="text-center">
          <Image size={48} className="mx-auto mb-3 opacity-50 animate-pulse" />
          <p className="text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 bg-gray-900">
        <div className="text-center">
          <Image size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400 bg-gray-900">
        <div className="text-center">
          <Image size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">无法加载图片</p>
        </div>
      </div>
    );
  }

  const dimensions = getImageDimensions();

  return (
    <div className={`h-full flex flex-col bg-gray-900 ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800/90 backdrop-blur flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Image size={16} className="text-blue-400" />
            <span className="text-sm font-medium text-gray-200">
              {filepath.split(/[/\\]/).pop()}
            </span>
          </div>
          {dimensions.width > 0 && dimensions.height > 0 && (
            <div className="text-xs text-gray-400">
              {dimensions.width} × {dimensions.height}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomOut}
            disabled={scale <= 0.25}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="缩小"
          >
            <ZoomOut size={16} className="text-gray-200" />
          </button>
          <span className="text-xs text-gray-300 min-w-[50px] text-center">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={handleZoomIn}
            disabled={scale >= 5}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="放大"
          >
            <ZoomIn size={16} className="text-gray-200" />
          </button>
          <button
            onClick={handleRotate}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            title="旋转"
          >
            <RotateCw size={16} className="text-gray-200" />
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors text-xs text-gray-200"
            title="重置"
          >
            重置
          </button>
          <div className="w-px h-6 bg-gray-600 mx-1" />
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 size={16} className="text-gray-200" /> : <Maximize2 size={16} className="text-gray-200" />}
          </button>
        </div>
      </div>

      {/* 图片显示区 */}
      <div className="flex-1 overflow-auto flex items-center justify-center p-4">
        <img
          src={data.base64}
          alt={filepath}
          className="max-w-full max-h-full object-contain transition-transform"
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
          }}
          draggable={false}
        />
      </div>

      {/* 底部信息栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800/90 backdrop-blur text-xs text-gray-400 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="uppercase">{data.metadata.extension.replace('.', '')}</span>
          <span>{formatFileSize(data.metadata.size)}</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{formatDate(data.metadata.modified)}</span>
        </div>
      </div>
    </div>
  );
};

export default ImagePreview;
