import React, { useState, useEffect } from 'react';
import { Table, File, RefreshCw, Sheet } from 'lucide-react';

interface ExcelPreviewProps {
  filepath: string;
}

interface ExcelCell {
  value: string | number;
  formula?: string;
}

interface ExcelRow {
  index: number;
  cells: ExcelCell[];
}

interface ExcelSheet {
  name: string;
  index: number;
  rows: ExcelRow[];
}

interface ExcelData {
  filepath: string;
  sheets: ExcelSheet[];
  activeSheet: number;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    sheetCount: number;
  };
}

const ExcelPreview: React.FC<ExcelPreviewProps> = ({ filepath }) => {
  const [data, setData] = useState<ExcelData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);

  useEffect(() => {
    loadFile();
  }, [filepath]);

  const loadFile = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.filePreview.preview(filepath);
      if (result.success && result.data) {
        setData(result.data);
        if (result.data.activeSheet !== undefined) {
          setActiveSheet(result.data.activeSheet);
        }
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

  // 获取当前活动工作表
  const currentSheet = data?.sheets[activeSheet];

  // 计算表格列数（基于最多行的单元格数）
  const columnCount = currentSheet?.rows.reduce((max, row) => Math.max(max, row.cells.length), 0) || 0;

  // 生成列标题 (A, B, C, ..., Z, AA, AB, ...)
  const getColumnHeader = (index: number): string => {
    let header = '';
    let i = index;
    while (i >= 0) {
      header = String.fromCharCode(65 + (i % 26)) + header;
      i = Math.floor(i / 26) - 1;
    }
    return header;
  };

  if (loading) {
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
          <Table size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-red-500">{error}</p>
          <button
            onClick={loadFile}
            className="mt-3 text-xs text-blue-500 hover:underline"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!data || !currentSheet) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <Table size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">无法加载文件</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Table size={16} className="text-green-600" />
            <span className="text-sm font-medium text-gray-700">
              {filepath.split(/[/\\]/).pop()}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {data.metadata.sheetCount} 个工作表
          </div>
        </div>
        <div className="text-xs text-gray-500">
          {formatFileSize(data.metadata.size)}
        </div>
      </div>

      {/* 工作表标签栏 */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-gray-200 bg-gray-100 flex-shrink-0 overflow-x-auto">
        {data.sheets.map((sheet, index) => (
          <button
            key={sheet.index}
            onClick={() => setActiveSheet(index)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-t-lg text-xs font-medium transition-all whitespace-nowrap ${
              activeSheet === index
                ? 'bg-white text-gray-800 border-t-2 border-blue-500'
                : 'text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Sheet size={14} />
            {sheet.name}
          </button>
        ))}
      </div>

      {/* 表格内容区 */}
      <div className="flex-1 overflow-auto">
        <div className="min-w-full inline-block">
          <table className="w-full border-collapse">
            <thead className="bg-gray-50 sticky top-0 z-10">
              <tr>
                {/* 行号列 */}
                <th className="w-12 px-2 py-2 text-xs font-semibold text-gray-500 bg-gray-100 border border-gray-300 text-center">
                  #
                </th>
                {/* 列标题 */}
                {Array.from({ length: columnCount }).map((_, index) => (
                  <th
                    key={index}
                    className="min-w-[100px] px-3 py-2 text-xs font-semibold text-gray-600 bg-gray-100 border border-gray-300 text-center"
                  >
                    {getColumnHeader(index)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {currentSheet.rows.map((row) => (
                <tr key={row.index} className="hover:bg-blue-50 transition-colors">
                  {/* 行号 */}
                  <td className="px-2 py-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 text-center font-medium">
                    {row.index + 1}
                  </td>
                  {/* 单元格 */}
                  {Array.from({ length: columnCount }).map((_, cellIndex) => {
                    const cell = row.cells[cellIndex];
                    const value = cell?.value ?? '';
                    const isEmpty = value === '';

                    return (
                      <td
                        key={cellIndex}
                        className={`px-3 py-1 text-sm border border-gray-200 ${
                          isEmpty ? 'bg-gray-50/50' : 'text-gray-800'
                        }`}
                      >
                        {cell?.formula ? (
                          <span className="text-blue-600" title={cell.formula}>
                            {value}
                          </span>
                        ) : (
                          <span>{value}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>工作表: {currentSheet.name}</span>
          <span>{currentSheet.rows.length} 行</span>
          <span>{columnCount} 列</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{formatDate(data.metadata.modified)}</span>
        </div>
      </div>
    </div>
  );
};

export default ExcelPreview;
