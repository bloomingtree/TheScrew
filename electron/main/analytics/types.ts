/**
 * Analytics Types - 数据分析类型定义
 *
 * 数据可视化模块的核心类型定义
 */

/**
 * 活动统计数据点
 */
export interface ActivityDataPoint {
  date: string;
  notesCount: number;
  conversationsCount: number;
  tasksCompleted: number;
  totalActivity: number;
}

/**
 * 图表数据
 */
export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}

/**
 * 统计摘要
 */
export interface StatisticsSummary {
  totalNotes: number;
  totalConversations: number;
  totalTasks: number;
  averageDailyActivity: number;
  mostActiveDay: string;
  leastActiveDay: string;
  trend: 'increasing' | 'decreasing' | 'stable';
}

/**
 * 时间范围
 */
export type TimeRange = '7d' | '30d' | '90d' | 'all';

/**
 * 分析报告
 */
export interface AnalysisReport {
  timeRange: TimeRange;
  summary: StatisticsSummary;
  chartData: ChartData;
  recommendations: string[];
  generatedAt: number;
}
