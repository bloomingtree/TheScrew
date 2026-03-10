import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder, FolderOpen, X, Plus, Terminal } from 'lucide-react';

// 终端风格色彩常量（与 ConfigDialog 保持一致）
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

interface WorkspaceSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  onWorkspaceSelect: (path: string) => void;
}

const WorkspaceSelector: React.FC<WorkspaceSelectorProps> = ({
  isOpen,
  onClose,
  onWorkspaceSelect,
}) => {
  const [recentWorkspaces, setRecentWorkspaces] = useState<string[]>([]);

  useEffect(() => {
    loadRecentWorkspaces();
  }, []);

  const loadRecentWorkspaces = () => {
    try {
      const saved = localStorage.getItem('recentWorkspaces');
      if (saved) {
        setRecentWorkspaces(JSON.parse(saved));
      }
    } catch (error) {
      console.error('Failed to load recent workspaces:', error);
    }
  };

  const saveRecentWorkspace = (path: string) => {
    try {
      let updated = recentWorkspaces.filter(w => w !== path);
      updated.unshift(path);
      updated = updated.slice(0, 5);
      setRecentWorkspaces(updated);
      localStorage.setItem('recentWorkspaces', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to save recent workspace:', error);
    }
  };

  const handleSelectWorkspace = (path: string) => {
    saveRecentWorkspace(path);
    onWorkspaceSelect(path);
    onClose();
  };

  const handleAddWorkspace = async () => {
    try {
      console.log('开始选择工作空间...');
      const result = await window.electronAPI.workspace.select();
      console.log('选择结果:', result);
      if (result.path) {
        console.log('成功选择路径:', result.path);
        handleSelectWorkspace(result.path);
      } else {
        console.log('未选择路径');
      }
    } catch (error) {
      console.error('Failed to select workspace:', error);
    }
  };

  const handleRemoveRecent = (e: React.MouseEvent, path: string) => {
    e.stopPropagation();
    const updated = recentWorkspaces.filter(w => w !== path);
    setRecentWorkspaces(updated);
    try {
      localStorage.setItem('recentWorkspaces', JSON.stringify(updated));
    } catch (error) {
      console.error('Failed to remove recent workspace:', error);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="w-full max-w-md font-mono max-h-[85vh] flex flex-col"
            style={{
              background: TERMINAL.lightBg,
              border: `1px solid ${TERMINAL.bgTertiary}`,
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
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
                <div className="flex gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: 'rgba(239, 68, 68, 0.6)' }}
                  />
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: 'rgba(234, 179, 8, 0.6)' }}
                  />
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: 'rgba(34, 197, 94, 0.6)' }}
                  />
                </div>
                <span
                  className="font-mono text-xs"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  工作空间选择器
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs" style={{ color: TERMINAL.green }}>
                  <Terminal size={12} className="inline" />
                </span>
                <button
                  onClick={onClose}
                  className="p-1 rounded transition-all hover:bg-black/5"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* 标题区域 */}
            <div className="p-4 text-center border-b shrink-0" style={{ borderColor: `${TERMINAL.bgTertiary}20` }}>
              <h2
                className="text-xl font-bold mb-1"
                style={{ color: TERMINAL.textDark }}
              >
                <span style={{ color: TERMINAL.cyan }}>&gt;</span> 选择工作空间
              </h2>
              <div
                className="text-xs flex items-center gap-2 justify-center flex-wrap"
                style={{ color: TERMINAL.textSecondary }}
              >
                <span style={{ color: TERMINAL.green }}>$</span>
                <span>选择或添加一个工作空间目录</span>
                {recentWorkspaces.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded" style={{ background: `${TERMINAL.purple}15`, color: TERMINAL.purple }}>
                    {recentWorkspaces.length} 个最近
                  </span>
                )}
              </div>
            </div>

            {/* 添加按钮 */}
            <div className="p-4 shrink-0">
              <button
                onClick={handleAddWorkspace}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-mono border transition-all hover:shadow-sm"
                style={{
                  background: `${TERMINAL.green}15`,
                  borderColor: TERMINAL.green,
                  color: TERMINAL.green,
                }}
              >
                <Plus size={16} />
                添加新的工作空间
              </button>
            </div>

            {/* 最近使用列表 */}
            {recentWorkspaces.length > 0 && (
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                <h3
                  className="text-xs font-medium mb-3 font-mono flex items-center gap-1.5"
                  style={{ color: TERMINAL.textSecondary }}
                >
                  <Terminal size={10} />
                  最近使用
                </h3>
                <div className="space-y-2">
                  {recentWorkspaces.map((path, index) => (
                    <motion.div
                      key={path}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={() => handleSelectWorkspace(path)}
                      className="group p-3 rounded-lg cursor-pointer border transition-all"
                      style={{
                        borderColor: `${TERMINAL.bgTertiary}30`,
                        background: '#fff',
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <FolderOpen
                          className="flex-shrink-0"
                          size={18}
                          style={{ color: TERMINAL.orange }}
                        />
                        <div className="flex-1 min-w-0">
                          <div
                            className="text-sm truncate"
                            style={{ color: TERMINAL.textDark }}
                          >
                            {path.split(/[\\/]/).pop()}
                          </div>
                          <div
                            className="text-xs truncate mt-0.5"
                            style={{ color: TERMINAL.textSecondary }}
                          >
                            {path}
                          </div>
                        </div>
                        <button
                          onClick={(e) => handleRemoveRecent(e, path)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded transition-all"
                          style={{ color: TERMINAL.textSecondary }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* 空状态 */}
            {recentWorkspaces.length === 0 && (
              <div
                className="flex-1 flex flex-col items-center justify-center py-8"
                style={{ color: TERMINAL.textSecondary }}
              >
                <Folder size={48} className="mb-3 opacity-40" />
                <p className="text-sm">暂无最近使用的工作空间</p>
                <p className="text-xs mt-1">点击上方按钮添加第一个工作空间</p>
              </div>
            )}

            {/* 底部提示 */}
            <div
              className="px-4 py-2 border-t text-xs text-center shrink-0"
              style={{
                borderColor: `${TERMINAL.bgTertiary}20`,
                color: TERMINAL.textSecondary,
              }}
            >
              <span style={{ color: TERMINAL.cyan }}>→</span> 点击选择工作空间
              {' · '}
              <span style={{ color: TERMINAL.pink }}>×</span> 移除记录
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default WorkspaceSelector;