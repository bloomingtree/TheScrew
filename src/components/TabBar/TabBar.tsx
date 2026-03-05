import React, { useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useTabStore, Tab } from '../../store/tabStore';

interface TabBarProps {
  panelId: 'left' | 'right';
}

const TabBar: React.FC<TabBarProps> = ({ panelId }) => {
  const { leftPanel, rightPanel, setActiveTab, closeTab } = useTabStore();
  const panel = panelId === 'left' ? leftPanel : rightPanel;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  if (!panel.isVisible || panel.tabs.length === 0) {
    return null;
  }

  const handleTabClick = (tabId: string) => {
    setActiveTab(tabId, panelId);
  };

  const handleTabClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId, panelId);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  const renderTab = (tab: Tab) => {
    const Icon = tab.icon;
    const isActive = tab.id === panel.activeTabId;

    return (
      <div
        key={tab.id}
        className={`group shrink-0 flex items-center gap-2 px-3 py-2 border-r text-sm cursor-pointer select-none transition-colors ${
          isActive
            ? 'bg-white text-gray-900 border-gray-200'
            : 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
        }`}
        onClick={() => handleTabClick(tab.id)}
      >
        {Icon && <Icon size={14} className="shrink-0" />}
        <span className="max-w-[150px] truncate">
          {tab.title}
          {tab.isModified && <span className="text-yellow-600 ml-1">*</span>}
        </span>
        {tab.canClose !== false && (
          <button
            onClick={(e) => handleTabClose(e, tab.id)}
            className="shrink-0 opacity-0 group-hover:opacity-100 hover:bg-gray-300 rounded p-0.5 transition-all"
            title="关闭标签"
          >
            <X size={12} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-center bg-gray-200 border-b border-gray-300">
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
        onWheel={handleWheel}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {panel.tabs.map(renderTab)}
      </div>
      {/* 可选：下拉菜单按钮 */}
      {panel.tabs.length > 5 && (
        <button className="shrink-0 px-2 py-1 text-gray-500 hover:text-gray-700 hover:bg-gray-300 rounded">
          <ChevronDown size={14} />
        </button>
      )}
    </div>
  );
};

export default TabBar;
