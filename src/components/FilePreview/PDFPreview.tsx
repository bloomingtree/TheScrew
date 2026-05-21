import React, { useState, useEffect, useCallback } from 'react';
import { FileText, ExternalLink, RefreshCw, ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';

interface PDFPreviewProps {
  filepath: string;
}

interface PDFMetadata {
  path: string;
  size?: number;
  modified?: string;
}

const PDFPreview: React.FC<PDFPreviewProps> = ({ filepath }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<PDFMetadata | null>(null);
  const [pdfData, setPdfData] = useState<Uint8Array | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [renderedPages, setRenderedPages] = useState<Map<number, string>>(new Map());

  const loadFile = useCallback(async () => {
    setLoading(true);
    setError(null);
    setRenderedPages(new Map());
    try {
      const result = await window.electronAPI.pdf.preview(filepath);
      if (result.success && result.data) {
        setMetadata(result.data.metadata);

        // 将 base64 转为 Uint8Array
        const binaryString = atob(result.data.buffer);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        setPdfData(bytes);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  }, [filepath]);

  useEffect(() => {
    loadFile();
  }, [loadFile]);

  // 使用 pdfjs-dist 渲染页面
  useEffect(() => {
    if (!pdfData) return;

    const renderAllPages = async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';

        const pdf = await pdfjsLib.getDocument({ data: pdfData, useSystemFonts: true }).promise;
        setNumPages(pdf.numPages);

        const pages = new Map<number, string>();
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;

          await page.render({
            canvasContext: ctx,
            viewport: viewport,
          } as any).promise;

          pages.set(i, canvas.toDataURL('image/png'));
        }

        setRenderedPages(pages);
      } catch (err: any) {
        console.error('[PDFPreview] Render error:', err);
        setError('PDF 渲染失败: ' + err.message);
      }
    };

    renderAllPages();
  }, [pdfData, scale]);

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

  const goToPage = (page: number) => {
    if (page >= 1 && page <= numPages) {
      setPageNumber(page);
      // 滚动到对应页面
      const el = document.getElementById(`pdf-page-${page}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <RefreshCw size={48} className="mx-auto mb-3 opacity-50 animate-spin" />
          <p className="text-sm">正在加载 PDF...</p>
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
          <button onClick={loadFile} className="mt-3 text-xs text-blue-500 hover:underline">重试</button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <FileText size={16} className="text-red-600" />
          <span className="text-sm font-medium text-gray-700 truncate max-w-[200px]">
            {filepath.split(/[/\\]/).pop()}
          </span>
          <span className="text-xs text-gray-500">
            {numPages} 页 · {formatFileSize(metadata?.size)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale(s => Math.max(0.5, s - 0.2))}
            className="p-1 rounded hover:bg-gray-200 text-gray-600 transition-colors"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-xs text-gray-500 min-w-[36px] text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale(s => Math.min(3, s + 0.2))}
            className="p-1 rounded hover:bg-gray-200 text-gray-600 transition-colors"
            title="放大"
          >
            <ZoomIn size={14} />
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

      {/* PDF 页面渲染区 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-[900px] mx-auto space-y-4">
          {Array.from(renderedPages.entries()).sort(([a], [b]) => a - b).map(([pageNum, dataUrl]) => (
            <div
              key={pageNum}
              id={`pdf-page-${pageNum}`}
              className="bg-white shadow-md rounded mx-auto"
              style={{ maxWidth: '100%' }}
            >
              <img
                src={dataUrl}
                alt={`第 ${pageNum} 页`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 页面导航 */}
      <div className="flex items-center justify-center gap-4 px-4 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0">
        <button
          onClick={() => goToPage(pageNumber - 1)}
          disabled={pageNumber <= 1}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={pageNumber}
            onChange={e => {
              const page = parseInt(e.target.value);
              if (!isNaN(page)) goToPage(page);
            }}
            className="w-12 text-center text-sm border border-gray-200 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-red-300"
            min={1}
            max={numPages}
          />
          <span className="text-sm text-gray-600">/ {numPages}</span>
        </div>
        <button
          onClick={() => goToPage(pageNumber + 1)}
          disabled={pageNumber >= numPages}
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>PDF 文档</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{formatDate(metadata?.modified)}</span>
        </div>
      </div>
    </div>
  );
};

export default PDFPreview;
