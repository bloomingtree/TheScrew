/**
 * Analytics Tab - 数据分析标签页
 *
 * 活动趋势和数据统计的可视化界面
 */

import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from 'lucide-react';
import { useAnalyticsStore, TimeRange } from '@/store/analyticsStore';

const AnalyticsTab: React.FC = () => {
  const {
    timeRange,
    loading,
    summary,
    chartData,
    report,
    setTimeRange,
    loadReport,
  } = useAnalyticsStore();

  useEffect(() => {
    loadReport();
  }, [timeRange]);

  const handleRangeChange = (range: TimeRange) => {
    setTimeRange(range);
  };

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp size={16} className="text-green-500" />;
      case 'decreasing':
        return <TrendingDown size={16} className="text-red-500" />;
      default:
        return <Minus size={16} className="text-gray-400" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-white overflow-auto">
      {/* 时间范围选择 */}
      <div className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={16} className="text-blue-500" />
            <h3 className="font-semibold text-sm">活动统计</h3>
          </div>
        </div>
        <div className="flex gap-1">
          {(['7d', '30d', '90d'] as TimeRange[]).map((range) => (
            <button
              key={range}
              onClick={() => handleRangeChange(range)}
              className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                timeRange === range
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {range === '7d' && '7天'}
              {range === '30d' && '30天'}
              {range === '90d' && '90天'}
            </button>
          ))}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="p-4 space-y-4">
        {loading ? (
          <div className="text-center py-8 text-sm text-gray-500">加载中...</div>
        ) : summary ? (
          <>
            {/* 统计卡片 */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard
                label="总笔记"
                value={summary.totalNotes}
                icon="📝"
                color="blue"
              />
              <StatCard
                label="总对话"
                value={summary.totalConversations}
                icon="💬"
                color="purple"
              />
              <StatCard
                label="完成任务"
                value={summary.totalTasks}
                icon="✅"
                color="green"
              />
              <StatCard
                label="日均活动"
                value={summary.averageDailyActivity.toFixed(1)}
                icon="📊"
                color="orange"
              />
            </div>

            {/* 趋势分析 */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">活动趋势</span>
                <div className="flex items-center gap-1">
                  {getTrendIcon(summary.trend)}
                  <span className="text-xs text-gray-600 capitalize">
                    {summary.trend === 'increasing' && '上升'}
                    {summary.trend === 'decreasing' && '下降'}
                    {summary.trend === 'stable' && '稳定'}
                  </span>
                </div>
              </div>
            </div>

            {/* 最活跃/不活跃日期 */}
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-xs text-gray-600 mb-1">最活跃</div>
                <div className="text-sm font-medium truncate">{summary.mostActiveDay}</div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <div className="text-xs text-gray-600 mb-1">最不活跃</div>
                <div className="text-sm font-medium truncate">{summary.leastActiveDay}</div>
              </div>
            </div>

            {/* 活动图表（简化版） */}
            {chartData && <SimpleChart data={chartData} />}

            {/* 建议 */}
            {report?.recommendations && report.recommendations.length > 0 && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-sm font-medium mb-2">💡 建议</div>
                <ul className="text-xs text-gray-700 space-y-1">
                  {report.recommendations.map((rec: string, i: number) => (
                    <li key={i}>• {rec}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-sm text-gray-400">
            暂无数据
          </div>
        )}
      </div>
    </div>
  );
};

// 统计卡片
const StatCard: React.FC<{
  label: string;
  value: number;
  icon: string;
  color: string;
}> = ({ label, value, icon, color }) => {
  const colorClasses = {
    blue: 'bg-blue-50 border-blue-200',
    purple: 'bg-purple-50 border-purple-200',
    green: 'bg-green-50 border-green-200',
    orange: 'bg-orange-50 border-orange-200',
  };

  return (
    <div className={`p-3 rounded-lg border ${colorClasses[color as keyof typeof colorClasses]}`}>
      <div className="text-lg mb-1">{icon}</div>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-xs text-gray-600">{label}</div>
    </div>
  );
};

// 简化图表（不使用外部库）
const SimpleChart: React.FC<{ data: any }> = ({ data }) => {
  const max = Math.max(
    ...data.datasets.flatMap(d => d.data)
  );

  return (
    <div className="p-3 border border-gray-200 rounded-lg">
      <div className="text-xs font-medium mb-2">活动趋势</div>
      <div className="space-y-1">
        {data.datasets.slice(0, 2).map((dataset: any) => (
          <div key={dataset.label} className="flex items-center gap-2">
            <div className="text-xs text-gray-600 w-16">{dataset.label}</div>
            <div className="flex-1 h-3 bg-gray-100 rounded overflow-hidden">
              {dataset.data.slice(-7).map((value: number, i: number) => (
                <div
                  key={i}
                  className="h-full"
                  style={{
                    width: `${100 / 7}%`,
                    backgroundColor: dataset.borderColor,
                    opacity: 0.3 + (value / max) * 0.7,
                  }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between text-xs text-gray-500 mt-1">
        <span>7天前</span>
        <span>今天</span>
      </div>
    </div>
  );
};

export default AnalyticsTab;
