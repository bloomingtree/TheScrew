import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, HardDrive, History } from 'lucide-react';
import { useRightPanelStore, RightPanelTab } from '../../store/rightPanelStore';
import PreviewTab from './tabs/PreviewTab';
import FilesTab from './tabs/FilesTab';
import HistoryTab from './tabs/HistoryTab';

const RightPanel: React.FC = () => {
  const {
    isOpen,
    width,
    isResizing,
    activeTab,
    setOpen,
    setWidth,
    setResizing,
    setActiveTab,
    currentPreviewFile,
  } = useRightPanelStore();

  const panelRef = useRef<HTMLDivElement>(null);
  const resizeHandleRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);

  // 处理拖拽调整宽度
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    startXRef.current = e.clientX;
    startWidthRef.current = width;
    setResizing(true);
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const deltaX = startXRef.current - e.clientX;
      setWidth(startWidthRef.current + deltaX);
    };

    const handleMouseUp = () => {
      if (isResizing) {
        setResizing(false);
      }
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizing, setWidth, setResizing]);

  // 标签页配置
  const tabs: Array<{ key: RightPanelTab; label: string; icon: React.ElementType }> = [
    { key: 'preview', label: '文件预览', icon: FileText },
    { key: 'files', label: '工作空间', icon: HardDrive },
    { key: 'history', label: '工具历史', icon: History },
  ];

  // 渲染当前标签页内容
  const renderTabContent = () => {
    switch (activeTab) {
      case 'preview':
        return <PreviewTab />;
      case 'files':
        return <FilesTab />;
      case 'history':
        return <HistoryTab />;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          ref={panelRef}
          initial={{ width: 0, opacity: 0 }}
          animate={{ width, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="relative h-full bg-white border-l border-gray-200 flex flex-col"
          style={{ width: isResizing ? width : undefined }}
        >
          {/* 拖拽调整宽度的手柄 */}
          <div
            ref={resizeHandleRef}
            onMouseDown={handleMouseDown}
            className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-500/50 transition-colors z-10 ${
              isResizing ? 'bg-blue-500' : ''
            }`}
          />

          {/* 顶部工具栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
            {/* 标签页切换 */}
            <div className="flex items-center gap-1">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-white text-blue-600 shadow-sm'
                        : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 关闭按钮 */}
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-200 transition-colors text-gray-500 hover:text-gray-700"
              title="关闭侧边栏"
            >
              <X size={16} />
            </button>
          </div>

          {/* 标签页内容 */}
          <div className="flex-1 overflow-hidden">
            {renderTabContent()}
          </div>

          {/* 底部状态栏 */}
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-500 flex items-center justify-between">
            <span>
              {activeTab === 'preview' && currentPreviewFile
                ? `当前: ${currentPreviewFile.split(/[\\/]/).pop()}`
                : tabs.find((t) => t.key === activeTab)?.label}
            </span>
            <span>{width}px</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default RightPanel;
