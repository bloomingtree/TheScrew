import React from 'react';

interface ResizerProps {
  onMouseDown: (e: React.MouseEvent) => void;
  isResizing: boolean;
}

export const Resizer: React.FC<ResizerProps> = ({ onMouseDown, isResizing }) => {
  return (
    <div
      onMouseDown={onMouseDown}
      className={`shrink-0 w-1 bg-gray-300 hover:bg-blue-500 cursor-col-resize transition-colors relative ${
        isResizing ? 'bg-blue-500' : ''
      }`}
      style={{
        width: '4px',
        cursor: isResizing ? 'col-resize' : 'col-resize',
      }}
    >
      {/* 视觉提示条 */}
      <div
        className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0.5 h-4 bg-gray-400 rounded transition-opacity ${
          isResizing ? 'opacity-0' : 'opacity-50'
        }`}
      />
    </div>
  );
};
