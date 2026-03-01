/**
 * Analytics Module - 数据分析模块
 *
 * 导出数据分析模块的所有公共接口
 */

export * from './types';
export { ActivityAnalyzer, getActivityAnalyzer, resetActivityAnalyzer } from './ActivityAnalyzer';

// 类型重新导出（保持兼容性）
export type {
  ActivityDataPoint,
  ChartData,
  StatisticsSummary,
  TimeRange,
  AnalysisReport,
} from './types';
