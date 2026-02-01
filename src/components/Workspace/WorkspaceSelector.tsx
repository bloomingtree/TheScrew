import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Folder, FolderOpen, X, Plus } from 'lucide-react';
import { cn } from '../../utils/cn';

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

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="rounded-2xl shadow-2xl w-full max-w-md mx-4 border border-gray-200/50 p-6 bg-workspace-50"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-cream-900">选择工作空间</h2>
          <button
            onClick={onClose}
            className="text-cream-500 hover:text-cream-900 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <button
          onClick={handleAddWorkspace}
          className={cn(
            "w-full mb-6 p-4 rounded-xl border-2 border-dashed border-gray-300/50",
            "hover:border-primary-blue/50 hover:bg-primary-blue/10",
            "transition-all flex items-center justify-center gap-2 text-cream-600 hover:text-cream-900"
          )}
        >
          <Plus size={20} />
          <span>添加新的工作空间</span>
        </button>

        {recentWorkspaces.length > 0 && (
          <div>
            <h3 className="text-sm font-medium text-cream-600 mb-3">最近使用</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentWorkspaces.map((path, index) => (
                <motion.div
                  key={path}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  onClick={() => handleSelectWorkspace(path)}
                  className={cn(
                    "group p-3 rounded-xl cursor-pointer",
                    "hover:bg-white/70 border border-transparent hover:border-gray-200/50",
                    "transition-all flex items-center gap-3"
                  )}
                >
                  <FolderOpen className="text-purple-500 flex-shrink-0" size={20} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-cream-900 truncate">
                      {path.split(/[\\/]/).pop()}
                    </div>
                    <div className="text-xs text-cream-500 truncate mt-0.5">
                      {path}
                    </div>
                  </div>
                  <button
                    onClick={(e) => handleRemoveRecent(e, path)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded-lg transition-all"
                  >
                    <X size={14} className="text-cream-400 hover:text-red-500" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {recentWorkspaces.length === 0 && (
          <div className="text-center py-8 text-cream-400">
            <Folder size={48} className="mx-auto mb-3 opacity-50" />
            <p className="text-sm">暂无最近使用的工作空间</p>
            <p className="text-xs mt-1">点击上方按钮添加第一个工作空间</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default WorkspaceSelector;