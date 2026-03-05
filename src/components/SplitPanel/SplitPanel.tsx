import React, { useState, useRef, useCallback } from 'react';
import { useTabStore } from '../../store/tabStore';
import TabBar from '../TabBar';
import TabContent from '../TabContent';
import { Resizer } from './Resizer';

interface SplitPanelProps {
  className?: string;
}

const SplitPanel: React.FC<SplitPanelProps> = ({ className }) => {
  const { leftPanel, rightPanel, isSplit } = useTabStore();
  const [leftPanelSize, setLeftPanelSize] = useState(50); // 百分比
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);

  // 左侧面板是否可见
  const leftVisible = leftPanel.isVisible;
  // 右侧面板是否可见
  const rightVisible = isSplit && rightPanel.isVisible;

  // 处理拖拽调整大小
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);

    const container = containerRef.current;
    if (!container) return;

    const startX = e.clientX;
    const startLeftSize = leftPanelSize;

    const handleMouseMove = (e: MouseEvent) => {
      const containerRect = container.getBoundingClientRect();
      const newLeftSize = ((e.clientX - containerRect.left) / containerRect.width) * 100;

      // 限制范围 (20% - 80%)
      const clampedSize = Math.max(20, Math.min(80, newLeftSize));
      setLeftPanelSize(clampedSize);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [leftPanelSize]);

  // 样式计算
  const leftPanelStyle = leftVisible ? {
    flex: rightVisible ? `${leftPanelSize} 1 0%` : '1 1 0%',
    minWidth: rightVisible ? '20%' : '200px',
    display: 'flex',
    flexDirection: 'column' as const,
  } : { display: 'none' };

  const rightPanelStyle = rightVisible ? {
    flex: leftVisible ? `${100 - leftPanelSize} 1 0%` : '1 1 0%',
    minWidth: leftVisible ? '20%' : '200px',
    display: 'flex',
    flexDirection: 'column' as const,
  } : { display: 'none' };

  return (
    <div
      ref={containerRef}
      className={`flex-1 flex overflow-hidden ${className || ''}`}
      style={{ cursor: isResizing ? 'col-resize' : 'default' }}
    >
      {/* 左面板 */}
      <div style={leftPanelStyle} className="bg-white flex flex-col min-w-0">
        <TabBar panelId="left" />
        <TabContent panelId="left" />
      </div>

      {/* 分割线 */}
      {leftVisible && rightVisible && (
        <Resizer onMouseDown={handleMouseDown} isResizing={isResizing} />
      )}

      {/* 右面板 */}
      <div style={rightPanelStyle} className="bg-white flex flex-col min-w-0">
        <TabBar panelId="right" />
        <TabContent panelId="right" />
      </div>
    </div>
  );
};

export default SplitPanel;
