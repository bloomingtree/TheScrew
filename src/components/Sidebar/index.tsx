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
  const [workspaceNotSet, setWorkspaceNotSet] = useState(false);

  const {
    conversations,
    currentConversationId,
    deleteConversation,
    selectConversation
  } = useConversationStore();

  const { setConfigOpen } = useConfigStore();
  const { currentPreviewFile, setOpen: setPreviewOpen } = useRightPanelStore();

  // 加载工作空间文件
  useEffect(() => {
    loadWorkspaceFiles();
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

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  };

  const getFileIcon = (file: WorkspaceFile, size: number = 14) => {
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

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'docx') {
      setActiveModal('preview');
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
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown size={12} className="text-gray-400" />
                ) : (
                  <ChevronRight size={12} className="text-gray-400" />
                )
              ) : (
                <span style={{ width: 12 }} />
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
          <>
            {/* 遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[100]"
              onClick={() => setActiveModal(null)}
            />

            {/* Modal 内容 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="fixed left-[100px] top-4 bottom-4 w-[500px] bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl z-[101] flex flex-col overflow-hidden"
              style={{ border: '1px solid rgba(65, 72, 104, 0.2)' }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 shrink-0">
                <h2 className="font-semibold text-gray-800">{getModalTitle()}</h2>
                <button
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500"
                >
                  <X size={16} />
                </button>
              </div>

              {/* 内容 */}
              <div className="flex-1 overflow-hidden">
                {activeModal === 'history' ? (
                  <div className="h-full overflow-y-auto p-4 space-y-2">
                    {conversations.length === 0 ? (
                      <div className="text-center py-8 text-gray-400 text-sm">
                        暂无历史对话
                      </div>
                    ) : (
                      conversations.map((conversation, index) => (
                        <div
                          key={conversation.id}
                          onClick={() => handleSelectConversation(conversation.id)}
                          className={`group relative cursor-pointer transition-all font-mono ${
                            currentConversationId === conversation.id ? '' : ''
                          }`}
                          style={{
                            padding: '12px 16px',
                            borderRadius: '10px',
                            border: '1px solid',
                            background:
                              currentConversationId === conversation.id
                                ? 'rgba(122, 162, 247, 0.1)'
                                : 'rgba(255, 255, 255, 0.8)',
                            borderColor:
                              currentConversationId === conversation.id
                                ? 'rgba(122, 162, 247, 0.3)'
                                : 'rgba(65, 72, 104, 0.15)',
                          }}
                          onMouseEnter={(e) => {
                            if (currentConversationId !== conversation.id) {
                              e.currentTarget.style.background = 'rgba(42, 195, 222, 0.08)';
                              e.currentTarget.style.borderColor = 'rgba(42, 195, 222, 0.25)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (currentConversationId !== conversation.id) {
                              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.8)';
                              e.currentTarget.style.borderColor = 'rgba(65, 72, 104, 0.15)';
                            }
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className="text-xs shrink-0 w-4"
                              style={{ color: 'rgba(86, 95, 137, 0.6)' }}
                            >
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span
                                className="text-sm truncate block"
                                style={{
                                  color:
                                    currentConversationId === conversation.id
                                      ? TERMINAL.blue
                                      : TERMINAL.textDark,
                                  fontWeight:
                                    currentConversationId === conversation.id ? 500 : 400,
                                }}
                              >
                                {conversation.title}
                              </span>
                              <div className="text-[10px] mt-1" style={{ color: TERMINAL.textSecondary }}>
                                {new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}
                              </div>
                            </div>
                          </div>
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => handleDeleteConversation(e, conversation.id)}
                              className="p-1.5 hover:bg-red-100 rounded text-red-500 transition-colors"
                              title="删除"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : (
                  <div className="h-full overflow-auto">
                    {renderModalContent()}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default Sidebar;
