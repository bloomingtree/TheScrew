/**
 * Activity Analyzer - 活动分析器
 *
 * 分析用户活动数据并生成统计报告
 */

import { getMemoryStore } from '../memory/MemoryStore';
import type {
  ActivityDataPoint,
  ChartData,
  StatisticsSummary,
  TimeRange,
  AnalysisReport,
} from './types';

export class ActivityAnalyzer {
  private memoryStore = getMemoryStore();

  /**
   * 分析指定时间范围内的活动
   */
  async analyzeActivity(timeRange: TimeRange = '30d'): Promise<ActivityDataPoint[]> {
    const days = this.getDaysCount(timeRange);
    const today = new Date();
    const stats: ActivityDataPoint[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);

      const dateStr = this.formatDate(date);

      // 统计每日活动
      const notesCount = await this.countNotesForDate(date);
      const conversationsCount = await this.countConversationsForDate(date);
      const tasksCompleted = await this.countTasksForDate(date);

      stats.push({
        date: dateStr,
        notesCount,
        conversationsCount,
        tasksCompleted,
        totalActivity: notesCount + conversationsCount + tasksCompleted,
      });
    }

    return stats;
  }

  /**
   * 生成图表数据
   */
  async generateChartData(timeRange: TimeRange = '30d'): Promise<ChartData> {
    const stats = await this.analyzeActivity(timeRange);

    return {
      labels: stats.map(s => s.date),
      datasets: [
        {
          label: '总活动',
          data: stats.map(s => s.totalActivity),
          borderColor: '#3B82F6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
        },
        {
          label: '笔记数量',
          data: stats.map(s => s.notesCount),
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
        },
        {
          label: '对话数量',
          data: stats.map(s => s.conversationsCount),
          borderColor: '#8B5CF6',
          backgroundColor: 'rgba(139, 92, 246, 0.1)',
        },
        {
          label: '完成任务',
          data: stats.map(s => s.tasksCompleted),
          borderColor: '#F59E0B',
          backgroundColor: 'rgba(245, 158, 11, 0.1)',
        },
      ],
    };
  }

  /**
   * 生成统计摘要
   */
  async generateSummary(timeRange: TimeRange = '30d'): Promise<StatisticsSummary> {
    const stats = await this.analyzeActivity(timeRange);

    const totalNotes = stats.reduce((sum, s) => sum + s.notesCount, 0);
    const totalConversations = stats.reduce((sum, s) => sum + s.conversationsCount, 0);
    const totalTasks = stats.reduce((sum, s) => sum + s.tasksCompleted, 0);
    const totalActivity = stats.reduce((sum, s) => sum + s.totalActivity, 0);

    const averageDailyActivity = stats.length > 0 ? totalActivity / stats.length : 0;

    // 找出最活跃和最不活跃的日期
    const mostActive = stats.reduce((max, s) =>
      s.totalActivity > max.totalActivity ? s : max
    );
    const leastActive = stats.reduce((min, s) =>
      s.totalActivity < min.totalActivity ? s : min
    );

    // 分析趋势
    const recentHalf = stats.slice(Math.floor(stats.length / 2));
    const earlierHalf = stats.slice(0, Math.floor(stats.length / 2));
    const recentAvg = recentHalf.reduce((sum, s) => sum + s.totalActivity, 0) / recentHalf.length;
    const earlierAvg = earlierHalf.reduce((sum, s) => sum + s.totalActivity, 0) / earlierHalf.length;

    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (recentAvg > earlierAvg * 1.1) {
      trend = 'increasing';
    } else if (recentAvg < earlierAvg * 0.9) {
      trend = 'decreasing';
    }

    return {
      totalNotes,
      totalConversations,
      totalTasks,
      averageDailyActivity: Math.round(averageDailyActivity * 100) / 100,
      mostActiveDay: mostActive.date,
      leastActiveDay: leastActive.date,
      trend,
    };
  }

  /**
   * 生成完整的分析报告
   */
  async generateReport(timeRange: TimeRange = '30d'): Promise<AnalysisReport> {
    const [summary, chartData, stats] = await Promise.all([
      this.generateSummary(timeRange),
      this.generateChartData(timeRange),
      this.analyzeActivity(timeRange),
    ]);

    // 生成建议
    const recommendations = this.generateRecommendations(summary, stats);

    return {
      timeRange,
      summary,
      chartData,
      recommendations,
      generatedAt: Date.now(),
    };
  }

  /**
   * 生成建议
   */
  private generateRecommendations(summary: StatisticsSummary, stats: ActivityDataPoint[]): string[] {
    const recommendations: string[] = [];

    // 基于趋势的建议
    if (summary.trend === 'decreasing') {
      recommendations.push('近期活动呈下降趋势，建议增加日常记录或设定每日目标');
    } else if (summary.trend === 'increasing') {
      recommendations.push('近期活动持续增长，请继续保持良好习惯');
    }

    // 基于笔记数量的建议
    if (summary.totalNotes < stats.length * 0.5) {
      recommendations.push('建议增加每日笔记记录，帮助记忆重要信息');
    }

    // 基于任务完成的建议
    if (summary.totalTasks === 0) {
      recommendations.push('尝试使用任务管理功能，帮助跟踪和完成待办事项');
    } else if (summary.totalTasks > summary.totalNotes * 2) {
      recommendations.push('任务完成数量很高，记得总结工作成果生成周报');
    }

    // 活动不均匀的建议
    const variance = this.calculateVariance(stats.map(s => s.totalActivity));
    if (variance > 100) {
      recommendations.push('活动分布不均匀，建议养成规律的工作习惯');
    }

    return recommendations;
  }

  /**
   * 计算方差
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  }

  /**
   * 统计指定日期的笔记数量
   */
  private async countNotesForDate(date: Date): Promise<number> {
    try {
      const note = await this.memoryStore.getDailyNote(date);
      return note && note.trim().length > 0 ? 1 : 0;
    } catch {
      return 0;
    }
  }

  /**
   * 统计指定日期的对话数量（简化实现）
   */
  private async countConversationsForDate(_date: Date): Promise<number> {
    // TODO: 从数据库查询指定日期的对话数量
    // 这里暂时返回 0
    return 0;
  }

  /**
   * 统计指定日期完成的任务数量（简化实现）
   */
  private async countTasksForDate(_date: Date): Promise<number> {
    // TODO: 从数据库查询指定日期完成的任务数量
    // 这里暂时返回 0
    return 0;
  }

  /**
   * 获取天数
   */
  private getDaysCount(timeRange: TimeRange): number {
    switch (timeRange) {
      case '7d':
        return 7;
      case '30d':
        return 30;
      case '90d':
        return 90;
      case 'all':
        return 365; // 默认一年
      default:
        return 30;
    }
  }

  /**
   * 格式化日期
   */
  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let activityAnalyzerInstance: ActivityAnalyzer | null = null;

/**
 * Get the singleton ActivityAnalyzer instance
 */
export function getActivityAnalyzer(): ActivityAnalyzer {
  if (!activityAnalyzerInstance) {
    activityAnalyzerInstance = new ActivityAnalyzer();
  }
  return activityAnalyzerInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetActivityAnalyzer(): void {
  activityAnalyzerInstance = null;
}

export default ActivityAnalyzer;
