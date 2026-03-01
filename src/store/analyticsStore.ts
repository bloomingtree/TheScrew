/**
 * Analytics Store - 数据分析状态管理
 *
 * 使用 Zustand 管理数据分析状态
 */

import { create } from 'zustand';

export type TimeRange = '7d' | '30d' | '90d' | 'all';

export interface StatisticsSummary {
  totalNotes: number;
  totalConversations: number;
  totalTasks: number;
  averageDailyActivity: number;
  mostActiveDay: string;
  leastActiveDay: string;
  trend: 'increasing' | 'decreasing' | 'stable';
}

export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }[];
}

interface AnalyticsState {
  // 时间范围
  timeRange: TimeRange;

  // 加载状态
  loading: boolean;
  error: string | null;

  // 数据
  stats: any[];
  summary: StatisticsSummary | null;
  chartData: ChartData | null;
  report: any | null;

  // Actions
  setTimeRange: (range: TimeRange) => void;
  loadAnalytics: () => Promise<void>;
  loadSummary: () => Promise<void>;
  loadChartData: () => Promise<void>;
  loadReport: () => Promise<void>;

  // 重置
  reset: () => void;
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  // Initial state
  timeRange: '30d',
  loading: false,
  error: null,
  stats: [],
  summary: null,
  chartData: null,
  report: null,

  // 设置时间范围
  setTimeRange: (range: TimeRange) => {
    set({ timeRange: range });
    get().loadAnalytics();
  },

  // 加载分析数据
  loadAnalytics: async () => {
    const { timeRange } = get();
    set({ loading: true, error: null });
    try {
      const result = await (window as any).electronAPI.invoke('analytics:analyze', timeRange);
      if (result.success) {
        set({ stats: result.stats, loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  // 加载摘要
  loadSummary: async () => {
    const { timeRange } = get();
    set({ loading: true, error: null });
    try {
      const result = await (window as any).electronAPI.invoke('analytics:summary', timeRange);
      if (result.success) {
        set({ summary: result.summary, loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  // 加载图表数据
  loadChartData: async () => {
    const { timeRange } = get();
    set({ loading: true, error: null });
    try {
      const result = await (window as any).electronAPI.invoke('analytics:chartData', timeRange);
      if (result.success) {
        set({ chartData: result.chartData, loading: false });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  // 加载完整报告
  loadReport: async () => {
    const { timeRange } = get();
    set({ loading: true, error: null });
    try {
      const result = await (window as any).electronAPI.invoke('analytics:report', timeRange);
      if (result.success) {
        set({
          report: result.report,
          summary: result.report.summary,
          chartData: result.report.chartData,
          loading: false,
        });
      } else {
        set({ error: result.error, loading: false });
      }
    } catch (error: any) {
      set({ error: error.message, loading: false });
    }
  },

  // 重置
  reset: () => {
    set({
      timeRange: '30d',
      loading: false,
      error: null,
      stats: [],
      summary: null,
      chartData: null,
      report: null,
    });
  },
}));
