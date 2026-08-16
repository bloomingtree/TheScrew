import React, { useState, useEffect, useRef, useCallback } from 'react';
import { FileText, ExternalLink, RefreshCw, ZoomIn, ZoomOut } from 'lucide-react';
import { useFilePreviewWatcher } from '@/hooks/useFilePreviewWatcher';

interface WordPreviewProps {
  filepath: string;
}

interface WordMetadata {
  path: string;
  size?: number;
  modified?: string;
}

const WordPreview: React.FC<WordPreviewProps> = ({ filepath }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<WordMetadata | null>(null);
  const [scale, setScale] = useState(100);
  const [pendingBlob, setPendingBlob] = useState<Blob | null>(null);

  // 当有待渲染的 blob 时，渲染到容器
  useEffect(() => {
    if (!pendingBlob || !containerRef.current) return;

    const renderDoc = async () => {
      try {
        const docxPreviewModule = await import('docx-preview');
        const renderAsync = docxPreviewModule.renderAsync || docxPreviewModule.default?.renderAsync;
        if (!renderAsync) {
          throw new Error('docx-preview 模块加载失败');
        }
        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          await renderAsync(pendingBlob, containerRef.current, undefined, {
            className: 'docx-preview-wrapper',
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: false,
          });
          console.log('[WordPreview] Rendered successfully, children:', containerRef.current.children.length);
        }
      } catch (err: any) {
        console.error('[WordPreview] Render error:', err);
        setError(err.message || '渲染失败');
      }
    };

    renderDoc();
  }, [pendingBlob]);

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.word.preview(filepath);
      if (result.success && result.data) {
        setMetadata(result.data.metadata);

        // 将 base64 转为 Blob
        const binaryString = atob(result.data.buffer);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

        // 先结束 loading（让容器挂载到 DOM），再设置 blob 触发渲染
        setLoading(false);
        // 使用 setTimeout 确保 DOM 已更新
        setTimeout(() => setPendingBlob(blob), 0);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      console.error('[WordPreview] Error:', err);
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filepath]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  // 监听磁盘文件变更，自动重新加载
  useFilePreviewWatcher(filepath, loadFile);

  const formatFileSize = (bytes?: number): string => {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-blue-600" />
          <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
            {filepath.split(/[/\\]/).pop()}
          </span>
          {metadata && (
            <span className="text-xs text-gray-500">
              {formatFileSize(metadata.size)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(s => Math.max(50, s - 10))}
            className="p-1 rounded hover:bg-gray-200 text-gray-600 transition-colors"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-gray-500 min-w-[36px] text-center">{scale}%</span>
          <button
            onClick={() => setScale(s => Math.min(200, s + 10))}
            className="p-1 rounded hover:bg-gray-200 text-gray-600 transition-colors"
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
          <button
            onClick={loadFile}
            className="p-1 rounded hover:bg-gray-200 text-gray-600 transition-colors"
            title="刷新"
          >
            <RefreshCw size={14} />
          </button>
          <button
            onClick={() => window.electronAPI.fileEditor.openWithSystem(filepath)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded text-gray-600 hover:bg-gray-200 transition-colors"
            title="用系统程序打开"
          >
            <ExternalLink size={14} />
            打开
          </button>
        </div>
      </div>

      {/* 文档渲染区 — 始终在 DOM 中，避免 containerRef 丢失 */}
      <div
        className="flex-1 overflow-auto relative"
        style={{
          transform: `scale(${scale / 100})`,
          transformOrigin: 'top center',
        }}
      >
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="text-center text-gray-400">
              <RefreshCw size={48} className="mx-auto mb-3 opacity-50 animate-spin" />
              <p className="text-sm">正在加载文档...</p>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
            <div className="text-center text-gray-400">
              <FileText size={48} className="mx-auto mb-3 opacity-50" />
              <p className="text-sm text-red-500">{error}</p>
              <button onClick={loadFile} className="mt-3 text-xs text-blue-500 hover:underline">重试</button>
            </div>
          </div>
        )}
        <div
          ref={containerRef}
          className="docx-preview-container"
          style={{ minHeight: '100%' }}
        />
      </div>

      {/* docx-preview 样式 */}
      <style>{`
        .docx-preview-container {
          background: white;
          min-height: 100%;
        }
        .docx-preview-container .docx-preview-wrapper {
          background: white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.12);
          margin: 16px auto;
          max-width: 100%;
        }
        .docx-preview-container .docx-preview-wrapper section {
          padding: 48px 64px !important;
          min-height: auto !important;
        }
      `}</style>
    </div>
  );
};

export default WordPreview;
