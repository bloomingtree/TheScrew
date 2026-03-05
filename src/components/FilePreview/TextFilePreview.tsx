import React, { useState, useEffect } from 'react';
import { File, X, Search, Maximize2, Minimize2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

interface TextFilePreviewProps {
  filepath: string;
}

interface TextFileData {
  content: string;
  encoding: string;
  lineCount: number;
  metadata: {
    path: string;
    size?: number;
    modified?: string;
    extension: string;
  };
}

const TextFilePreview: React.FC<TextFilePreviewProps> = ({ filepath }) => {
  const [data, setData] = useState<TextFileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentLine, setCurrentLine] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

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
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const getLanguage = (extension: string): string => {
    const langMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.py': 'python',
      '.java': 'java',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.go': 'go',
      '.rs': 'rust',
      '.rb': 'ruby',
      '.php': 'php',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.sh': 'bash',
      '.bash': 'bash',
      '.zsh': 'bash',
      '.sql': 'sql',
      '.json': 'json',
      '.xml': 'xml',
      '.html': 'html',
      '.htm': 'html',
      '.css': 'css',
      '.scss': 'scss',
      '.sass': 'sass',
      '.yaml': 'yaml',
      '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini',
      '.md': 'markdown',
      '.markdown': 'markdown',
      '.txt': 'text',
      '.csv': 'text',
      '.tsv': 'text',
      '.log': 'text',
      '.dockerfile': 'docker',
      '.makefile': 'makefile',
      '.cmake': 'cmake',
      '.env': 'bash',
      '.gitignore': 'text',
    };
    return langMap[extension.toLowerCase()] || 'text';
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

  // 搜索过滤行
  const filteredLines = React.useMemo(() => {
    if (!data) return [];
    if (!searchQuery.trim()) return data.content.split('\n');

    return data.content.split('\n').filter((line, index) =>
      line.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (index + 1).toString().includes(searchQuery)
    );
  }, [data, searchQuery]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <File size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">加载中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <File size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <File size={48} className="mx-auto mb-3 opacity-50" />
          <p className="text-sm">无法加载文件</p>
        </div>
      </div>
    );
  }

  const language = getLanguage(data.metadata.extension);
  const lines = data.content.split('\n');

  return (
    <div className={`h-full flex flex-col ${isFullscreen ? 'fixed inset-0 z-50 bg-white' : ''}`}>
      {/* 头部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <File size={16} className="text-gray-500" />
            <span className="text-sm font-medium text-gray-700">
              {filepath.split(/[/\\]/).pop()}
            </span>
          </div>
          <div className="text-xs text-gray-500">
            {data.lineCount} 行 · {formatFileSize(data.metadata.size)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-500"
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* 搜索栏 */}
      <div className="px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索内容或行号..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {searchQuery && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              {filteredLines.length} / {lines.length} 行
            </div>
          )}
        </div>
      </div>

      {/* 代码内容区 */}
      <div className="flex-1 overflow-auto bg-[#1e1e1e]">
        <div className="min-h-full">
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            showLineNumbers
            startingLineNumber={1}
            lineNumberStyle={{ fontSize: '12px', color: '#858585' }}
            customStyle={{
              margin: 0,
              padding: '16px',
              fontSize: '13px',
              lineHeight: '1.6',
              background: '#1e1e1e',
              minHeight: '100%',
            }}
          >
            {data.content}
          </SyntaxHighlighter>
        </div>
      </div>

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>{language}</span>
          <span>UTF-8</span>
        </div>
        <div className="flex items-center gap-4">
          <span>{formatDate(data.metadata.modified)}</span>
        </div>
      </div>
    </div>
  );
};

export default TextFilePreview;
