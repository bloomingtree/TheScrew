/**
 * Analytics IPC Handlers
 *
 * IPC handlers for the analytics system
 */

import { ipcMain } from 'electron';
import { getActivityAnalyzer } from '../analytics/ActivityAnalyzer';
import type { TimeRange } from '../analytics/types';

/**
 * Register analytics-related IPC handlers
 */
export function registerAnalyticsHandlers(): void {
  const analyzer = getActivityAnalyzer();

  // 分析活动数据
  ipcMain.handle('analytics:analyze', async (_event, timeRange: TimeRange = '30d') => {
    try {
      const stats = await analyzer.analyzeActivity(timeRange);
      return {
        success: true,
        stats,
        count: stats.length,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 生成图表数据
  ipcMain.handle('analytics:chartData', async (_event, timeRange: TimeRange = '30d') => {
    try {
      const chartData = await analyzer.generateChartData(timeRange);
      return {
        success: true,
        chartData,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 生成统计摘要
  ipcMain.handle('analytics:summary', async (_event, timeRange: TimeRange = '30d') => {
    try {
      const summary = await analyzer.generateSummary(timeRange);
      return {
        success: true,
        summary,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  // 生成完整报告
  ipcMain.handle('analytics:report', async (_event, timeRange: TimeRange = '30d') => {
    try {
      const report = await analyzer.generateReport(timeRange);
      return {
        success: true,
        report,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  });

  console.log('[IPC] Analytics handlers registered');
}
