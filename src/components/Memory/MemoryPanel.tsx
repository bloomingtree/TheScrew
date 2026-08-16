/**
 * MemoryPanel - 记忆管理面板
 *
 * 提供：
 * - 文件 tab 切换（MEMORY.md / topics/ / daily/）
 * - Monaco editor 只读展示
 * - 搜索框 + 搜索结果列表
 * - 统计信息
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Editor from '@monaco-editor/react';
import {
  Search,
  RefreshCw,
  FileText,
  FolderOpen,
  Brain,
  ChevronRight,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// 终端风格色彩常量（与 Sidebar 保持一致）
const TERMINAL = {
  bg: '#1a1b26',
  bgSecondary: '#24283b',
  bgTertiary: '#414868',
  lightBg: '#fff8f0',
  green: '#9ece6a',
  orange: '#ff9e64',
  blue: '#7aa2f7',
  cyan: '#2ac3de',
  purple: '#bb9af7',
  pink: '#f7768e',
  yellow: '#e0af68',
  textPrimary: '#c0caf5',
  textSecondary: '#565f89',
  textDark: '#1a1b26',
};

type TabKey = 'index' | 'topics' | 'daily';

interface FileEntry {
  name: string;
  relPath: string;
}

interface SearchMatch {
  file: string;
  line: number;
  preview: string;
}

interface Stats {
  longTermMemorySize: number;
  dailyNotesCount: number;
  totalMemories: number;
}

const MemoryPanel: React.FC = () => {
  // ===== State =====
  const [activeTab, setActiveTab] = useState<TabKey>('index');
  const [currentFile, setCurrentFile] = useState<string>('MEMORY.md');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // topics / daily 文件列表
  const [fileList, setFileList] = useState<FileEntry[]>([]);
  const [listLoading, setListLoading] = useState<boolean>(false);

  // 搜索
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState<boolean>(false);
  const [hasSearched, setHasSearched] = useState<boolean>(false);

  // 统计
  const [stats, setStats] = useState<Stats | null>(null);

  // ===== 加载文件内容 =====
  const loadFile = useCallback(async (relPath: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.memory.readFile(relPath);
      if (result.success) {
        setContent(result.content || '');
        setCurrentFile(relPath);
      } else {
        setError(result.error || '读取失败');
        setContent('');
      }
    } catch (err: any) {
      setError(err.message || '读取失败');
      setContent('');
    } finally {
      setLoading(false);
    }
  }, []);

  // ===== 加载文件列表（topics / daily） =====
  const loadFileList = useCallback(async (scope: 'topics' | 'daily') => {
    setListLoading(true);
    try {
      const result = await window.electronAPI.memory.listFiles(scope);
      if (result.success && result.files) {
        setFileList(result.files);
        // 自动选中第一个文件
        if (result.files.length > 0) {
          await loadFile(result.files[0].relPath);
        } else {
          setContent('');
          setCurrentFile('');
        }
      } else {
        setFileList([]);
      }
    } catch (err) {
      setFileList([]);
    } finally {
      setListLoading(false);
    }
  }, [loadFile]);

  // ===== 加载统计 =====
  const loadStats = useCallback(async () => {
    try {
      const result = await window.electronAPI.memory.getStats();
      if (result.success && result.stats) {
        setStats(result.stats);
      }
    } catch (err) {
      // 静默失败
    }
  }, []);

  // ===== Tab 切换处理 =====
  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setError(null);
    setSearchResults([]);
    setHasSearched(false);
    setSearchQuery('');

    if (tab === 'index') {
      loadFile('MEMORY.md');
      setFileList([]);
    } else {
      loadFileList(tab);
    }
  }, [loadFile, loadFileList]);

  // ===== 搜索 =====
  const handleSearch = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setSearching(true);
    setHasSearched(true);
    try {
      const result = await window.electronAPI.memory.search(query, {
        maxResults: 20,
      });
      if (result.success && result.results) {
        // 适配返回格式：每条 { file, line, preview } 或 { type, date, preview, ... }
        const matches: SearchMatch[] = result.results.map((r: any) => ({
          file: r.file || r.type || r.path || '未知文件',
          line: r.line || 1,
          preview: r.preview || r.content || '',
        }));
        setSearchResults(matches);
      } else {
        setSearchResults([]);
      }
    } catch (err: any) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // ===== 点击搜索结果 =====
  const handleSearchResultClick = useCallback((match: SearchMatch) => {
    const filePath = match.file;
    // 判断属于哪个 tab
    if (filePath === 'MEMORY.md' || filePath === 'long_term' || filePath === 'index') {
      handleTabChange('index');
    } else if (filePath.startsWith('topics/') || filePath.startsWith('topics\\')) {
      setActiveTab('topics');
      loadFileList('topics').then(() => loadFile(filePath));
    } else if (filePath.startsWith('daily/') || filePath.startsWith('daily\\') || filePath === 'daily_note') {
      setActiveTab('daily');
      loadFileList('daily').then(() => loadFile(filePath));
    } else {
      // long_term / daily_note 等旧格式映射
      if (filePath === 'daily_note') {
        handleTabChange('daily');
      } else {
        // 兜底：尝试直接读取
        loadFile(filePath);
      }
    }
  }, [handleTabChange, loadFileList, loadFile]);

  // ===== 初始化 =====
  useEffect(() => {
    loadFile('MEMORY.md');
    loadStats();
  }, [loadFile, loadStats]);

  // ===== 格式化文件大小 =====
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  // ===== 计算行数和字节数 =====
  const fileInfo = useMemo(() => {
    const lines = content ? content.split('\n').length : 0;
    const bytes = content ? new Blob([content]).size : 0;
    return { lines, bytes };
  }, [content]);

  // ===== 渲染 =====
  return (
    <div className="h-full flex flex-col font-mono" style={{ background: TERMINAL.lightBg }}>
      {/* ===== 统计栏 ===== */}
      <div
        className="flex items-center gap-3 px-4 py-2 border-b text-xs"
        style={{
          borderColor: `${TERMINAL.bgTertiary}30`,
          color: TERMINAL.textSecondary,
        }}
      >
        <span style={{ color: TERMINAL.green }}>$</span>
        <Brain size={12} style={{ color: TERMINAL.purple }} />
        <span>
          记忆系统
        </span>
        <span style={{ color: TERMINAL.textSecondary }}>·</span>
        {stats ? (
          <>
            <span>总条目: <span style={{ color: TERMINAL.cyan }}>{stats.totalMemories ?? '-'}</span></span>
            <span style={{ color: TERMINAL.textSecondary }}>·</span>
            <span>Daily: <span style={{ color: TERMINAL.cyan }}>{stats.dailyNotesCount ?? '-'}</span></span>
            <span style={{ color: TERMINAL.textSecondary }}>·</span>
            <span>索引大小: <span style={{ color: TERMINAL.cyan }}>{stats.longTermMemorySize ? formatSize(stats.longTermMemorySize) : '-'}</span></span>
          </>
        ) : (
          <span style={{ color: TERMINAL.textSecondary }}>加载统计中...</span>
        )}
        <button
          onClick={loadStats}
          className="ml-auto p-1 rounded hover:bg-black/5 transition-colors"
          title="刷新统计"
        >
          <RefreshCw size={12} style={{ color: TERMINAL.textSecondary }} />
        </button>
      </div>

      {/* ===== Tab 切换 ===== */}
      <div
        className="flex items-center gap-1 px-3 py-2 border-b"
        style={{ borderColor: `${TERMINAL.bgTertiary}30` }}
      >
        {([
          { key: 'index' as TabKey, label: 'MEMORY.md', icon: FileText },
          { key: 'topics' as TabKey, label: 'topics/', icon: FolderOpen },
          { key: 'daily' as TabKey, label: 'daily/', icon: FolderOpen },
        ]).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
              style={{
                background: isActive ? `${TERMINAL.purple}15` : 'transparent',
                color: isActive ? TERMINAL.purple : TERMINAL.textSecondary,
                border: `1px solid ${isActive ? `${TERMINAL.purple}40` : 'transparent'}`,
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = `${TERMINAL.purple}08`;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <Icon size={12} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ===== 文件列表（topics / daily tab 显示） ===== */}
      {activeTab !== 'index' && (
        <div
          className="px-3 py-2 border-b max-h-32 overflow-y-auto"
          style={{ borderColor: `${TERMINAL.bgTertiary}20` }}
        >
          {listLoading ? (
            <div className="text-xs py-2 text-center" style={{ color: TERMINAL.textSecondary }}>
              加载文件列表...
            </div>
          ) : fileList.length === 0 ? (
            <div className="text-xs py-2 text-center" style={{ color: TERMINAL.textSecondary }}>
              暂无文件（{activeTab === 'topics' ? 'AI 写入主题记忆后会出现在这里' : '每日笔记会自动创建'}）
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {fileList.map((file) => {
                const isActive = currentFile === file.relPath;
                return (
                  <button
                    key={file.relPath}
                    onClick={() => loadFile(file.relPath)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-all"
                    style={{
                      background: isActive ? `${TERMINAL.cyan}15` : 'rgba(255,255,255,0.6)',
                      color: isActive ? TERMINAL.cyan : TERMINAL.textDark,
                      border: `1px solid ${isActive ? `${TERMINAL.cyan}40` : `${TERMINAL.bgTertiary}20`}`,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = `${TERMINAL.cyan}08`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.6)';
                      }
                    }}
                    title={file.relPath}
                  >
                    <FileText size={10} />
                    <span>{file.name}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== 当前文件路径显示 ===== */}
      <div
        className="flex items-center gap-1.5 px-4 py-1.5 text-xs border-b"
        style={{
          borderColor: `${TERMINAL.bgTertiary}20`,
          color: TERMINAL.textSecondary,
        }}
      >
        <ChevronRight size={10} />
        <span style={{ color: TERMINAL.textDark, fontWeight: 500 }}>
          {currentFile || '未选择文件'}
        </span>
        {content && (
          <>
            <span style={{ color: TERMINAL.textSecondary }}>·</span>
            <span>{fileInfo.lines} 行</span>
            <span style={{ color: TERMINAL.textSecondary }}>·</span>
            <span>{formatSize(fileInfo.bytes)}</span>
          </>
        )}
      </div>

      {/* ===== Monaco Editor 区域 ===== */}
      <div className="flex-1 overflow-hidden relative">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <RefreshCw size={32} className="mx-auto mb-2 animate-spin" style={{ color: TERMINAL.textSecondary }} />
              <p className="text-xs" style={{ color: TERMINAL.textSecondary }}>加载中...</p>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center">
              <AlertCircle size={32} className="mx-auto mb-2" style={{ color: TERMINAL.pink }} />
              <p className="text-xs" style={{ color: TERMINAL.pink }}>{error}</p>
            </div>
          </div>
        ) : !content ? (
          <div className="h-full flex items-center justify-center p-6">
            <div className="text-center">
              <FileText size={32} className="mx-auto mb-2 opacity-40" style={{ color: TERMINAL.textSecondary }} />
              <p className="text-xs" style={{ color: TERMINAL.textSecondary }}>
                {activeTab === 'index' ? 'MEMORY.md 暂无内容' : '选择上方文件查看内容'}
              </p>
            </div>
          </div>
        ) : (
          <Editor
            height="100%"
            language="markdown"
            theme="vs-dark"
            value={content}
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineHeight: 1.6,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
              renderWhitespace: 'selection',
              tabSize: 2,
            }}
          />
        )}
      </div>

      {/* ===== 搜索区域 ===== */}
      <div
        className="border-t flex flex-col"
        style={{
          borderColor: `${TERMINAL.bgTertiary}30`,
          background: '#fff',
        }}
      >
        {/* 搜索输入框 */}
        <div className="px-3 py-2">
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2"
              size={14}
              style={{ color: TERMINAL.textSecondary }}
            />
            <input
              type="text"
              placeholder="搜索记忆内容（回车执行）..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSearch();
                }
              }}
              className="w-full pl-9 pr-3 py-2 text-xs rounded-md focus:outline-none transition-all"
              style={{
                background: TERMINAL.lightBg,
                border: `1px solid ${TERMINAL.bgTertiary}30`,
                color: TERMINAL.textDark,
              }}
            />
            {searching && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <RefreshCw size={12} className="animate-spin" style={{ color: TERMINAL.textSecondary }} />
              </div>
            )}
          </div>
        </div>

        {/* 搜索结果列表 */}
        <AnimatePresence>
          {hasSearched && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="max-h-40 overflow-y-auto px-3 pb-2">
                <div
                  className="text-xs mb-1.5 px-1"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  {searching
                    ? '搜索中...'
                    : searchResults.length > 0
                    ? `找到 ${searchResults.length} 条结果`
                    : '无匹配结果'}
                </div>
                {searchResults.map((match, idx) => (
                  <button
                    key={`${match.file}-${match.line}-${idx}`}
                    onClick={() => handleSearchResultClick(match)}
                    className="w-full text-left px-2 py-1.5 rounded transition-all text-xs mb-1"
                    style={{
                      background: idx % 2 === 0 ? `${TERMINAL.purple}05` : 'transparent',
                      border: `1px solid ${TERMINAL.bgTertiary}15`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = `${TERMINAL.purple}12`;
                      e.currentTarget.style.borderColor = `${TERMINAL.purple}30`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = idx % 2 === 0 ? `${TERMINAL.purple}05` : 'transparent';
                      e.currentTarget.style.borderColor = `${TERMINAL.bgTertiary}15`;
                    }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium"
                        style={{
                          background: `${TERMINAL.purple}15`,
                          color: TERMINAL.purple,
                        }}
                      >
                        {match.file}
                      </span>
                      <span style={{ color: TERMINAL.textSecondary }}>:{match.line}</span>
                    </div>
                    {match.preview && (
                      <div
                        className="mt-1 truncate"
                        style={{ color: TERMINAL.textDark, fontSize: '11px' }}
                      >
                        {match.preview}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default MemoryPanel;
