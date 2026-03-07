import React, { useState, useEffect, useCallback } from 'react';
import { File, X, Search, Maximize2, Minimize2, Edit3, Save, XCircle, Code } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useTabStore } from '@/store/tabStore';

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
  const { openTab } = useTabStore();
  const [data, setData] = useState<TextFileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

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
        setEditContent(result.data.content);
      } else {
        setError(result.error || '加载失败');
      }
    } catch (err: any) {
      setError(err.message || '加载失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveStatus('idle');
    try {
      const result = await window.electronAPI.filePreview.saveText(filepath, editContent);
      if (result.success) {
        setSaveStatus('success');
        // 更新数据
        setData({
          ...data!,
          content: editContent,
          lineCount: editContent.split('\n').length,
        });
        // 1.5秒后退出编辑模式
        setTimeout(() => {
          setIsEditing(false);
          setSaveStatus('idle');
        }, 1500);
      } else {
        setSaveStatus('error');
        setError(result.error || '保存失败');
      }
    } catch (err: any) {
      setSaveStatus('error');
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setEditContent(data?.content || '');
    setIsEditing(false);
    setSaveStatus('idle');
  };

  const handleStartEdit = () => {
    setEditContent(data?.content || '');
    setIsEditing(true);
    setSaveStatus('idle');
  };

  // 在 Monaco Editor 中打开
  const handleEditInMonaco = () => {
    openTab({
      type: 'editor',
      title: filepath.split(/[/\\]/).pop() || '文件',
      content: { filepath },
    });
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
          {isEditing ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-all border border-green-200 hover:bg-green-50 text-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="保存 (Ctrl+S)"
              >
                <Save size={14} />
                <span className="hidden sm:inline">{saving ? '保存中...' : '保存'}</span>
              </button>
              <button
                onClick={handleCancelEdit}
                disabled={saving}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-all border border-gray-200 hover:bg-gray-100 text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                title="取消编辑"
              >
                <XCircle size={14} />
                <span className="hidden sm:inline">取消</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleEditInMonaco}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-all border border-purple-200 hover:bg-purple-50 text-purple-600"
                title="在 Monaco Editor 中编辑"
              >
                <Code size={14} />
                <span className="hidden sm:inline">Monaco</span>
              </button>
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-all border border-blue-200 hover:bg-blue-50 text-blue-600"
                title="快速编辑"
              >
                <Edit3 size={14} />
                <span className="hidden sm:inline">编辑</span>
              </button>
            </>
          )}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded hover:bg-gray-200 transition-colors text-gray-500"
            title={isFullscreen ? '退出全屏' : '全屏'}
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </div>

      {/* 保存状态提示 */}
      {saveStatus === 'success' && (
        <div className="px-4 py-2 bg-green-50 border-b border-green-200 text-green-700 text-xs flex items-center gap-2 flex-shrink-0">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
          <span>保存成功！正在退出编辑模式...</span>
        </div>
      )}
      {saveStatus === 'error' && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 text-red-700 text-xs flex items-center gap-2 flex-shrink-0">
          <XCircle size={14} />
          <span>保存失败，请重试</span>
        </div>
      )}

      {/* 搜索栏 (仅在非编辑模式显示) */}
      {!isEditing && (
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
      )}

      {/* 内容区域 */}
      {isEditing ? (
        // 编辑模式：使用 textarea
        <div className="flex-1 overflow-auto bg-[#1e1e1e]">
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full min-h-full p-4 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-sm leading-1.6 resize-none focus:outline-none"
            spellCheck={false}
            autoFocus
          />
        </div>
      ) : (
        // 预览模式：使用 SyntaxHighlighter
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
      )}

      {/* 底部状态栏 */}
      <div className="flex items-center justify-between px-4 py-1 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>{language}</span>
          <span>UTF-8</span>
          {isEditing && (
            <span className="text-blue-600">
              {editContent.split('\n').length} 行
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          <span>{formatDate(data.metadata.modified)}</span>
        </div>
      </div>
    </div>
  );
};

export default TextFilePreview;
