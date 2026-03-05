import React, { useState, useEffect } from 'react';
import {
  Settings,
  Sparkles,
  Zap,
  BarChart3,
  History as HistoryIcon,
  X,
  Folder,
  File,
  FileText,
  Table,
  Image as ImageIcon,
  ChevronRight,
  ChevronDown,
  HardDrive,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useConversationStore } from '../../store/conversationStore';
import { useConfigStore } from '../../store/configStore';
import { useRightPanelStore } from '../../store/rightPanelStore';
import { useTabStore } from '../../store/tabStore';
import ReportsTab from '../RightPanel/tabs/ReportsTab';
import WorkflowsTab from '../RightPanel/tabs/WorkflowsTab';
import AnalyticsTab from '../RightPanel/tabs/AnalyticsTab';
import PreviewTab from '../RightPanel/tabs/PreviewTab';

// 终端风格色彩常量
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

// 功能按钮配置
const FUNCTION_ITEMS = [
  { key: 'reports', icon: Sparkles, label: '工作报告', color: TERMINAL.purple },
  { key: 'workflows', icon: Zap, label: '工作流', color: TERMINAL.orange },
  { key: 'analytics', icon: BarChart3, label: '数据分析', color: TERMINAL.green },
];

interface WorkspaceFile {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  modified?: number;
  children?: WorkspaceFile[];
}

type ModalType = 'history' | 'reports' | 'workflows' | 'analytics' | 'preview' | null;

interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loadedDirectories, setLoadedDirectories] = useState<Set<string>>(new Set());
  const [workspaceNotSet, setWorkspaceNotSet] = useState(false);

  const {
    conversations,
    currentConversationId,
    deleteConversation,
    selectConversation
  } = useConversationStore();

  const { setConfigOpen } = useConfigStore();
  const { currentPreviewFile, setOpen: setPreviewOpen } = useRightPanelStore();
  const { openTab, toggleSplit, isSplit } = useTabStore();

  // 加载工作空间文件
  useEffect(() => {
    loadWorkspaceFiles();

    // 启动文件监听
    const startWatching = async () => {
      try {
        const result = await window.electronAPI.workspace.startWatching?.();
        if (!result?.success) {
          console.warn('文件监听启动失败:', result?.error);
        }
      } catch (err) {
        console.warn('文件监听不可用:', err);
      }
    };
    startWatching();

    // 注册文件变化监听
    const removeListener = window.electronAPI.workspace.onFileChanged?.(() => {
      loadWorkspaceFiles();
    });

    return () => {
      removeListener?.();
      window.electronAPI.workspace.stopWatching?.();
    };
  }, []);

  const loadWorkspaceFiles = async () => {
    setIsLoadingFiles(true);
    setWorkspaceNotSet(false);
    try {
      const result = await window.electronAPI.workspace.listFiles();
      if (result.success && result.files) {
        const fileTree = buildFileTree(result.files);
        setWorkspaceFiles(fileTree);
      } else {
        // 工作空间未设置
        setWorkspaceNotSet(true);
        setWorkspaceFiles([]);
      }
    } catch (err) {
      console.error('加载文件列表失败:', err);
      setWorkspaceNotSet(true);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // 选择工作空间
  const selectWorkspace = async () => {
    const result = await window.electronAPI.workspace.select();
    if (result.path) {
      setWorkspaceNotSet(false);
      await loadWorkspaceFiles();
    }
  };

  const buildFileTree = (files: any[]): WorkspaceFile[] => {
    // 后端返回的是工作空间的顶层文件，直接返回
    // 不需要构建嵌套树结构（子目录在点击时动态展开）
    return files.map(file => ({
      ...file,
      type: file.type as 'file' | 'directory',
      children: file.type === 'directory' ? [] : undefined,
    }));
  };

  const handleSelectConversation = (id: string) => {
    selectConversation(id);
    setActiveModal(null);
  };

  const handleDeleteConversation = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await deleteConversation(id);
  };

  const handleFunctionClick = (type: ModalType) => {
    setActiveModal(type);
  };

  const loadDirectoryContents = async (dirPath: string): Promise<WorkspaceFile[]> => {
    try {
      const result = await window.electronAPI.workspace.listDirectory(dirPath);
      if (result.success && result.files) {
        return result.files.map(file => ({
          ...file,
          type: file.type as 'file' | 'directory',
          children: file.type === 'directory' ? [] : undefined,
        }));
      }
      return [];
    } catch (err) {
      console.error('加载目录内容失败:', err);
      return [];
    }
  };

  const toggleFolder = async (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      const wasExpanded = newSet.has(path);

      if (wasExpanded) {
        // 收起文件夹
        newSet.delete(path);
      } else {
        // 展开文件夹
        newSet.add(path);

        // 如果目录尚未加载，则加载内容
        if (!loadedDirectories.has(path)) {
          loadDirectoryContents(path).then(children => {
            setLoadedDirectories(prev => new Set(prev).add(path));

            setWorkspaceFiles(prevFiles => {
              const updateChildren = (files: WorkspaceFile[]): WorkspaceFile[] => {
                return files.map(file => {
                  if (file.path === path) {
                    return { ...file, children };
                  }
                  if (file.children) {
                    return { ...file, children: updateChildren(file.children) };
                  }
                  return file;
                });
              };
              return updateChildren(prevFiles);
            });
          });
        }
      }
      return newSet;
    });
  };

  const getFileIcon = (file: WorkspaceFile, size: number = 14) => {
    // .zero-employee 配置文件夹使用特殊图标
    if (file.name === '.zero-employee') {
      return <Settings size={size} className="text-yellow-500" />;
    }

    if (file.type === 'directory') {
      return <Folder size={size} className="text-yellow-500" />;
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'docx':
        return <FileText size={size} className="text-blue-500" />;
      case 'xlsx':
        return <Table size={size} className="text-green-500" />;
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
      case 'webp':
        return <ImageIcon size={size} className="text-purple-500" />;
      default:
        return <File size={size} className="text-gray-500" />;
    }
  };

  const handleFileClick = (file: WorkspaceFile) => {
    if (file.type === 'directory') {
      toggleFolder(file.path);
      return;
    }

    // 打开文件预览标签在左侧面板
    openTab({
      type: 'preview',
      title: file.name,
      content: { filepath: file.path },
    }, 'left');

    // 如果当前没有分屏，自动开启分屏（聊天会移到右侧）
    if (!isSplit) {
      toggleSplit();
    }
  };

  const renderFileNode = (file: WorkspaceFile, level: number = 0) => {
    const isExpanded = expandedFolders.has(file.path);
    const isDirectory = file.type === 'directory';
    const hasChildren = isDirectory && file.children && file.children.length > 0;

    return (
      <div key={file.path}>
        <div
          onClick={() => handleFileClick(file)}
          className="flex items-center gap-1 py-1 px-2 rounded cursor-pointer hover:bg-white/50 transition-colors"
          style={{ paddingLeft: `${level * 12 + 8}px` }}
        >
          {isDirectory && (
            <span className="shrink-0">
              {isExpanded ? (
                <ChevronDown size={12} className="text-gray-400" />
              ) : (
                <ChevronRight size={12} className="text-gray-400" />
              )}
            </span>
          )}
          {getFileIcon(file, 14)}
          <span className="text-xs truncate" style={{ color: TERMINAL.textDark }}>
            {file.name}
          </span>
        </div>
        {isExpanded && hasChildren && (
          <div>
            {file.children!.map(child => renderFileNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  // 过滤掉未保存的空对话
  const savedConversations = conversations.filter(c => !(c as any)._unsaved);

  const renderModalContent = () => {
    switch (activeModal) {
      case 'reports':
        return <ReportsTab />;
      case 'workflows':
        return <WorkflowsTab />;
      case 'analytics':
        return <AnalyticsTab />;
      case 'preview':
        return <PreviewTab />;
      default:
        return null;
    }
  };

  const getModalTitle = () => {
    switch (activeModal) {
      case 'reports':
        return '工作报告';
      case 'workflows':
        return '工作流';
      case 'analytics':
        return '数据分析';
      case 'preview':
        return currentPreviewFile?.split(/[\\/]/).pop() || '文件预览';
      case 'history':
        return '历史对话';
      default:
        return '';
    }
  };

  return (
    <>
      <motion.div
        initial={{ width: 48 }}
        animate={{ width: isOpen ? 280 : 48 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="backdrop-blur-sm border-r font-mono flex flex-col overflow-hidden absolute left-0 top-0 bottom-0"
        style={{
          backgroundColor: 'rgba(255, 248, 240, 0.8)',
          borderColor: 'rgba(65, 72, 104, 0.2)',
          zIndex: 50,
        }}
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        {/* 设置按钮 */}
        <div
          className="py-3 px-2 border-b"
          style={{ borderColor: 'rgba(65, 72, 104, 0.15)', minWidth: '48px' }}
        >
          <button
            onClick={() => setConfigOpen(true)}
            className={`flex items-center gap-2 overflow-hidden rounded-lg transition-all font-mono text-sm justify-start ${
              isOpen
                ? 'w-full h-8 py-2 px-2'
                : '!size-8 !px-2'
            }`}
            style={{
              background: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(65, 72, 104, 0.2)',
              color: TERMINAL.textSecondary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(42, 195, 222, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(42, 195, 222, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(65, 72, 104, 0.2)';
            }}
          >
            <Settings size={16} className="shrink-0" />
            {isOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm truncate"
                style={{ color: TERMINAL.textDark }}
              >
                设置
              </motion.span>
            )}
          </button>
        </div>

        {/* 功能导航 */}
        <div className="py-3 px-2 space-y-1">
          {FUNCTION_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                onClick={() => handleFunctionClick(item.key as ModalType)}
                className={`flex items-center gap-2 overflow-hidden rounded-lg transition-all font-mono text-sm justify-start ${
                  isOpen
                    ? 'w-full h-8 py-2 px-2'
                    : '!size-8 !px-2'
                }`}
                style={{
                  background: 'rgba(255, 255, 255, 0.6)',
                  border: '1px solid rgba(65, 72, 104, 0.2)',
                  color: item.color,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${item.color}15`;
                  e.currentTarget.style.borderColor = `${item.color}40`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.borderColor = 'rgba(65, 72, 104, 0.2)';
                }}
                title={item.label}
              >
                <Icon size={16} className="shrink-0" />
                {isOpen && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-sm truncate font-medium"
                    style={{ color: TERMINAL.textDark }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </button>
            );
          })}

          {/* 历史对话按钮 */}
          <button
            onClick={() => handleFunctionClick('history')}
            className={`flex items-center gap-2 overflow-hidden rounded-lg transition-all font-mono text-sm justify-start ${
              isOpen
                ? 'w-full h-8 py-2 px-2'
                : '!size-8 !px-2'
            }`}
            style={{
              background: 'rgba(255, 255, 255, 0.6)',
              border: '1px solid rgba(65, 72, 104, 0.2)',
              color: TERMINAL.textSecondary,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(122, 162, 247, 0.1)';
              e.currentTarget.style.borderColor = 'rgba(122, 162, 247, 0.3)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.6)';
              e.currentTarget.style.borderColor = 'rgba(65, 72, 104, 0.2)';
            }}
            title="历史对话"
          >
            <HistoryIcon size={16} className="shrink-0" />
            {isOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm truncate"
                style={{ color: TERMINAL.textDark }}
              >
                历史对话
              </motion.span>
            )}
          </button>
        </div>

        {/* 分隔线 */}
        <div className="px-2 py-2">
          <div style={{ height: 1, background: 'rgba(65, 72, 104, 0.15)' }} />
        </div>

        {/* 工作空间文件树 */}
        <div className="flex-1 overflow-y-auto px-2 pb-2 flex flex-col gap-2">
          {/* 工作空间按钮 */}
          <button
            onClick={workspaceNotSet ? selectWorkspace : loadWorkspaceFiles}
            className={`flex items-center gap-2 overflow-hidden rounded-lg transition-all font-mono text-sm justify-start ${
              isOpen
                ? 'w-full h-8 py-2 px-2'
                : '!size-8 !px-2'
            }`}
            style={{
              background: workspaceNotSet ? 'rgba(247, 118, 142, 0.15)' : 'rgba(255, 255, 255, 0.6)',
              border: workspaceNotSet ? '1px solid rgba(247, 118, 142, 0.4)' : '1px solid rgba(65, 72, 104, 0.2)',
              color: workspaceNotSet ? TERMINAL.pink : TERMINAL.cyan,
            }}
            onMouseEnter={(e) => {
              const color = workspaceNotSet ? TERMINAL.pink : TERMINAL.cyan;
              e.currentTarget.style.background = `${color}15`;
              e.currentTarget.style.borderColor = `${color}40`;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = workspaceNotSet ? 'rgba(247, 118, 142, 0.15)' : 'rgba(255, 255, 255, 0.6)';
              e.currentTarget.style.borderColor = workspaceNotSet ? 'rgba(247, 118, 142, 0.4)' : 'rgba(65, 72, 104, 0.2)';
            }}
            title={workspaceNotSet ? "点击选择工作空间" : "刷新文件列表"}
          >
            <HardDrive size={16} className={`${isLoadingFiles ? 'animate-spin' : ''} shrink-0`} />
            {isOpen && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm truncate font-semibold"
                style={{ color: workspaceNotSet ? TERMINAL.pink : TERMINAL.textDark }}
              >
                {workspaceNotSet ? '选择工作空间' : '工作空间'}
              </motion.span>
            )}
          </button>

          {/* 文件列表 */}
          {isOpen && (
            <div className="flex-1 overflow-y-auto">
              {isLoadingFiles ? (
                <div className="text-center py-4 text-xs" style={{ color: TERMINAL.textSecondary }}>
                  加载中...
                </div>
              ) : workspaceNotSet ? (
                <div className="text-center py-6 px-3">
                  <p className="text-xs mb-3" style={{ color: TERMINAL.textSecondary }}>
                    未设置工作空间
                  </p>
                  <button
                    onClick={selectWorkspace}
                    className="text-xs px-3 py-1.5 rounded transition-all"
                    style={{
                      background: 'rgba(42, 195, 222, 0.15)',
                      border: '1px solid rgba(42, 195, 222, 0.3)',
                      color: TERMINAL.cyan,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(42, 195, 222, 0.25)';
                      e.currentTarget.style.borderColor = 'rgba(42, 195, 222, 0.5)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'rgba(42, 195, 222, 0.15)';
                      e.currentTarget.style.borderColor = 'rgba(42, 195, 222, 0.3)';
                    }}
                  >
                    选择文件夹
                  </button>
                </div>
              ) : workspaceFiles.length === 0 ? (
                <div className="text-center py-4 text-xs" style={{ color: TERMINAL.textSecondary }}>
                  空文件夹
                </div>
              ) : (
                <div className="space-y-0.5">
                  {workspaceFiles.map(file => renderFileNode(file))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>

      {/* 通用 Modal */}
      <AnimatePresence>
        {activeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
            onClick={() => setActiveModal(null)}
          >
            {/* Modal 内容 */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="w-[500px] max-w-[calc(100vw-2rem)] h-[calc(100vh-2rem)] font-mono flex flex-col overflow-hidden rounded-2xl shadow-2xl"
              style={{
                background: TERMINAL.lightBg,
                border: `1px solid ${TERMINAL.bgTertiary}`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* 终端风格标题栏 */}
              <div
                className="flex items-center justify-between px-4 py-2.5 border-b shrink-0"
                style={{
                  background: `${TERMINAL.bgSecondary}30`,
                  borderColor: `${TERMINAL.bgTertiary}50`,
                }}
              >
                <div className="flex items-center gap-2">
                  {/* macOS 风格窗口控制点 */}
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(239, 68, 68, 0.6)' }}></div>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(234, 179, 8, 0.6)' }}></div>
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: 'rgba(34, 197, 94, 0.6)' }}></div>
                  </div>
                  <span className="font-mono text-xs" style={{ color: TERMINAL.textSecondary }}>
                    {activeModal === 'history' && <><HistoryIcon size={10} className="inline mr-1" /></>}
                    {getModalTitle()}
                  </span>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 rounded-lg transition-all hover:bg-black/5"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* 内容 */}
              <div className="flex-1 overflow-hidden">
                {activeModal === 'history' ? (
                  <div className="h-full flex flex-col">
                    {/* 统计信息 */}
                    <div className="px-5 py-3 border-b" style={{ borderColor: `${TERMINAL.bgTertiary}30` }}>
                      <div className="flex items-center gap-2 text-xs font-mono" style={{ color: TERMINAL.textSecondary }}>
                        <span style={{ color: TERMINAL.green }}>$</span>
                        <span>共 {savedConversations.length} 条历史对话</span>
                      </div>
                    </div>

                    {/* 对话列表 */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2">
                      {savedConversations.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8">
                          <HistoryIcon size={48} className="mb-4 opacity-30" style={{ color: TERMINAL.textSecondary }} />
                          <p className="text-sm font-mono" style={{ color: TERMINAL.textSecondary }}>
                            <span style={{ color: TERMINAL.green }}>$</span> 暂无历史对话
                          </p>
                          <p className="text-xs mt-2 font-mono" style={{ color: TERMINAL.textSecondary }}>
                            开始一段新对话后会自动保存
                          </p>
                        </div>
                      ) : (
                        savedConversations.map((conversation, index) => (
                          <motion.div
                            key={conversation.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            onClick={() => handleSelectConversation(conversation.id)}
                            className={`group relative cursor-pointer transition-all font-mono ${
                              currentConversationId === conversation.id ? '' : ''
                            }`}
                            style={{
                              padding: '14px 18px',
                              borderRadius: '12px',
                              border: '1px solid',
                              background:
                                currentConversationId === conversation.id
                                  ? `${TERMINAL.cyan}15`
                                  : '#fff',
                              borderColor:
                                currentConversationId === conversation.id
                                  ? TERMINAL.cyan
                                  : `${TERMINAL.bgTertiary}40`,
                            }}
                            onMouseEnter={(e) => {
                              if (currentConversationId !== conversation.id) {
                                e.currentTarget.style.background = `${TERMINAL.cyan}08`;
                                e.currentTarget.style.borderColor = `${TERMINAL.cyan}40`;
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (currentConversationId !== conversation.id) {
                                e.currentTarget.style.background = '#fff';
                                e.currentTarget.style.borderColor = `${TERMINAL.bgTertiary}40`;
                              }
                            }}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className="text-xs shrink-0 w-5 pt-0.5 font-mono"
                                style={{ color: currentConversationId === conversation.id ? TERMINAL.cyan : TERMINAL.textSecondary }}
                              >
                                {String(index + 1).padStart(2, '0')}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span
                                    className="text-sm truncate block font-medium"
                                    style={{
                                      color:
                                        currentConversationId === conversation.id
                                          ? TERMINAL.cyan
                                          : TERMINAL.textDark,
                                    }}
                                  >
                                    {conversation.title}
                                  </span>
                                  {currentConversationId === conversation.id && (
                                    <span className="text-xs font-mono px-1.5 py-0.5 rounded" style={{
                                      background: `${TERMINAL.cyan}20`,
                                      color: TERMINAL.cyan
                                    }}>
                                      当前
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs font-mono" style={{ color: TERMINAL.textSecondary }}>
                                  <span style={{ color: TERMINAL.green }}>📅</span>
                                  <span>{new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}</span>
                                  <span style={{ color: TERMINAL.textSecondary }}>·</span>
                                  <span>{conversation.messages.length} 条消息</span>
                                </div>
                              </div>
                            </div>
                            <button
                              onClick={(e) => handleDeleteConversation(e, conversation.id)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-50 text-gray-400 hover:text-red-500"
                              title="删除对话"
                              style={{
                                opacity: currentConversationId === conversation.id ? '1' : undefined
                              }}
                            >
                              <X size={14} />
                            </button>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-full overflow-auto">
                    {renderModalContent()}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
