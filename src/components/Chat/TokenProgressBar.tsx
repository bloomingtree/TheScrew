import React from 'react';
import { useChatStore } from '../../store/chatStore';
import { useConfigStore } from '../../store/configStore';
import { AlertTriangle, Database, Zap } from 'lucide-react';

const TokenProgressBar: React.FC = () => {
  const { tokenUsage } = useChatStore();
  const { maxTokens } = useConfigStore();

  // 使用配置中的 maxTokens 或 tokenUsage 中的 max
  const maxTokenLimit = maxTokens || tokenUsage.max;
  const percentage = (tokenUsage.current / maxTokenLimit) * 100;

  // 根据使用率设置颜色
  const getColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-orange-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getIcon = () => {
    if (percentage >= 90) return <AlertTriangle size={12} className="text-red-500" />;
    if (percentage >= 75) return <Database size={12} className="text-orange-500" />;
    return <Zap size={12} className="text-green-500" />;
  };

  // 格式化 token 数量
  const formatTokens = (num: number) => {
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}k`;
    }
    return num.toString();
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white/95 backdrop-blur rounded-lg shadow-lg border border-gray-200 p-3 min-w-[200px]">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-gray-700">
          {getIcon()}
          <span>Token 使用</span>
        </div>
        <div className="text-xs text-gray-500">
          {formatTokens(tokenUsage.current)} / {formatTokens(maxTokenLimit)}
        </div>
      </div>

      {/* 进度条 */}
      <div className="relative h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`absolute top-0 left-0 h-full transition-all duration-300 ${getColor()}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>

      {/* 百分比和压缩次数 */}
      <div className="flex items-center justify-between mt-2">
        <div className={`text-xs font-medium ${
          percentage >= 90 ? 'text-red-600' :
          percentage >= 75 ? 'text-orange-600' :
          percentage >= 50 ? 'text-yellow-600' :
          'text-green-600'
        }`}>
          {percentage.toFixed(1)}%
        </div>
        {tokenUsage.compressedCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-blue-600">
            <Database size={10} />
            <span>已压缩 {tokenUsage.compressedCount} 次</span>
          </div>
        )}
      </div>

      {/* 警告信息 */}
      {percentage >= 90 && (
        <div className="mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1 flex items-center gap-1">
          <AlertTriangle size={10} />
          <span>上下文接近上限，即将自动压缩</span>
        </div>
      )}
    </div>
  );
};

export default TokenProgressBar;
