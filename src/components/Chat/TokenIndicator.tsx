import React from 'react';
import { useChatStore } from '../../store/chatStore';
import { useConfigStore } from '../../store/configStore';
import { Zap } from 'lucide-react';

interface TokenIndicatorProps {
  className?: string;
}

const TokenIndicator: React.FC<TokenIndicatorProps> = ({ className = '' }) => {
  const { tokenUsage } = useChatStore();
  const { maxTokens } = useConfigStore();

  const maxTokenLimit = maxTokens || tokenUsage.max;
  const percentage = (tokenUsage.current / maxTokenLimit) * 100;

  // 根据使用率设置颜色
  const getColor = () => {
    if (percentage >= 90) return 'text-red-500';
    if (percentage >= 75) return 'text-orange-500';
    if (percentage >= 50) return 'text-yellow-500';
    return 'text-green-500';
  };

  const getBgColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  // 格式化 token 数量
  const formatTokens = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="flex items-center gap-1.5 text-xs text-gray-600">
        <Zap size={12} className={getColor()} />
        <span className="font-medium">{formatTokens(tokenUsage.current)}</span>
        <span className="text-gray-400">/ {formatTokens(maxTokenLimit)}</span>
      </div>
      {/* 迷你进度条 */}
      <div className="relative w-12 h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full transition-all duration-300 ${getBgColor()}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
};

export default TokenIndicator;
