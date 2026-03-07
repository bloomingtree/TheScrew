import React, { useRef } from 'react';
import { X, ChevronDown } from 'lucide-react';
import { useTabStore, Tab } from '../../store/tabStore';

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
        className={`group shrink-0 flex items-center gap-2 px-4 py-2.5 border-r text-sm font-mono cursor-pointer select-none transition-all relative ${
          isActive
            ? ''
            : 'opacity-60 hover:opacity-100'
        }`}
        style={{
          background: isActive ? '#fff' : `${TERMINAL.bgSecondary}15`,
          borderColor: `${TERMINAL.bgTertiary}30`,
          color: isActive ? TERMINAL.textDark : TERMINAL.textSecondary,
        }}
        onClick={() => handleTabClick(tab.id)}
      >
        {/* 图标 */}
        {Icon && (
          <span style={{ color: isActive ? TERMINAL.cyan : TERMINAL.textSecondary }}>
            <Icon size={13} className="shrink-0" />
          </span>
        )}

        {/* 标题 */}
        <span className="max-w-[120px] truncate font-medium">
          {tab.title}
        </span>

        {/* 修改标记 */}
        {tab.isModified && (
          <span style={{ color: TERMINAL.yellow }}>*</span>
        )}

        {/* 关闭按钮 */}
        {tab.canClose !== false && (
          <button
            onClick={(e) => handleTabClose(e, tab.id)}
            className="shrink-0 rounded transition-all"
            style={{
              opacity: isActive ? 1 : 0,
              background: 'transparent',
              padding: '2px',
            }}
            title="关闭标签"
          >
            <X size={11} style={{ color: isActive ? TERMINAL.textSecondary : TERMINAL.textSecondary }} />
          </button>
        )}

        {/* 激活状态指示器 */}
        {isActive && (
          <div
            className="absolute bottom-0 left-0 right-0 h-0.5"
            style={{
              background: `linear-gradient(90deg, ${TERMINAL.cyan}, ${TERMINAL.blue})`,
            }}
          />
        )}
      </div>
    );
  };

  return (
    <div
      className="flex items-center"
      style={{
        background: '#F5F5F0',
      }}
    >
      {/* 标签列表 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-hide"
        onWheel={handleWheel}
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {panel.tabs.map(renderTab)}
      </div>

      {/* 下拉菜单按钮 */}
      {panel.tabs.length > 5 && (
        <button
          className="shrink-0 px-3 py-2 rounded transition-all font-mono text-xs"
          style={{
            color: TERMINAL.textSecondary,
            background: 'transparent',
          }}
          title="更多标签"
        >
          <ChevronDown size={13} />
        </button>
      )}
    </div>
  );
};

export default TabBar;
