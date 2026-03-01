/**
 * Scheduled Report Service - 定时报告服务
 *
 * 管理自动生成报告的定时任务
 */

import { getCronService } from '../scheduler/CronService';
import { CronSchedule } from '../scheduler/types';

export interface ScheduledReportConfig {
  id: string;
  name: string;
  type: 'daily' | 'weekly' | 'monthly';
  enabled: boolean;
  schedule: CronSchedule;
  templateId: string;
}

/**
 * 定时报告服务
 */
export class ScheduledReportService {
  private scheduledReports: Map<string, ScheduledReportConfig> = new Map();

  /**
   * 初始化定时报告服务
   */
  async initialize(): Promise<void> {
    // 加载已保存的定时报告配置
    // TODO: 从持久化存储加载

    console.log(`[ScheduledReportService] Initialized with ${this.scheduledReports.size} scheduled reports`);
  }

  /**
   * 设置每周五自动生成周报
   */
  async scheduleWeeklyReport(
    hour: number = 17,
    minute: number = 0,
    dayOfWeek: number = 5
  ): Promise<string> {
    const cronService = getCronService();

    // Cron 表达式：分 时 日 月 周
    // "0 17 * * 5" = 每周五 17:00
    const cronExpr = `${minute} ${hour} * * ${dayOfWeek}`;

    const configId = 'weekly-report-auto';

    await cronService.addJob(
      `weekly-report-${configId}`,
      { kind: 'cron', expr: cronExpr },
      '请使用 generate_weekly_report 工具生成本周工作总结',
      { tools: ['generate_weekly_report'] }
    );

    // 保存配置
    this.scheduledReports.set(configId, {
      id: configId,
      name: '每周五自动周报',
      type: 'weekly',
      enabled: true,
      schedule: { kind: 'cron', expr: cronExpr },
      templateId: 'weekly-default',
    });

    console.log(`[ScheduledReportService] Scheduled weekly report: ${cronExpr}`);
    return configId;
  }

  /**
   * 设置每天自动生成日报
   */
  async scheduleDailyReport(
    hour: number = 18,
    minute: number = 0
  ): Promise<string> {
    const cronService = getCronService();

    // Cron 表达式："0 18 * * *" = 每天 18:00
    const cronExpr = `${minute} ${hour} * * *`;

    const configId = 'daily-report-auto';

    await cronService.addJob(
      `daily-report-${configId}`,
      { kind: 'cron', expr: cronExpr },
      '请使用 generate_daily_report 工具生成今日工作报告',
      { tools: ['generate_daily_report'] }
    );

    // 保存配置
    this.scheduledReports.set(configId, {
      id: configId,
      name: '每日自动日报',
      type: 'daily',
      enabled: true,
      schedule: { kind: 'cron', expr: cronExpr },
      templateId: 'daily-default',
    });

    console.log(`[ScheduledReportService] Scheduled daily report: ${cronExpr}`);
    return configId;
  }

  /**
   * 设置每月自动生成月报
   */
  async scheduleMonthlyReport(
    dayOfMonth: number = 1,
    hour: number = 9,
    minute: number = 0
  ): Promise<string> {
    const cronService = getCronService();

    // Cron 表达式："0 9 1 * *" = 每月1号 09:00
    const cronExpr = `${minute} ${hour} ${dayOfMonth} * *`;

    const configId = 'monthly-report-auto';

    await cronService.addJob(
      `monthly-report-${configId}`,
      { kind: 'cron', expr: cronExpr },
      '请生成月度工作报告',
      { tools: ['generate_weekly_report'] }
    );

    // 保存配置
    this.scheduledReports.set(configId, {
      id: configId,
      name: '每月自动月报',
      type: 'monthly',
      enabled: true,
      schedule: { kind: 'cron', expr: cronExpr },
      templateId: 'monthly-default',
    });

    console.log(`[ScheduledReportService] Scheduled monthly report: ${cronExpr}`);
    return configId;
  }

  /**
   * 移除定时报告
   */
  async removeScheduledReport(configId: string): Promise<boolean> {
    const config = this.scheduledReports.get(configId);
    if (!config) {
      return false;
    }

    const cronService = getCronService();

    // 根据类型删除对应的 cron 任务
    const jobName = `${config.type}-report-${configId}`;
    const removed = await cronService.removeJob(jobName);

    if (removed) {
      this.scheduledReports.delete(configId);
      console.log(`[ScheduledReportService] Removed scheduled report: ${configId}`);
    }

    return removed;
  }

  /**
   * 启用/禁用定时报告
   */
  async setScheduledReportEnabled(configId: string, enabled: boolean): Promise<boolean> {
    const config = this.scheduledReports.get(configId);
    if (!config) {
      return false;
    }

    const cronService = getCronService();
    const jobName = `${config.type}-report-${configId}`;

    if (enabled) {
      await cronService.enableJob(jobName, true);
    } else {
      await cronService.enableJob(jobName, false);
    }

    config.enabled = enabled;
    return true;
  }

  /**
   * 获取所有定时报告配置
   */
  getScheduledReports(): ScheduledReportConfig[] {
    return Array.from(this.scheduledReports.values());
  }

  /**
   * 获取单个定时报告配置
   */
  getScheduledReport(configId: string): ScheduledReportConfig | undefined {
    return this.scheduledReports.get(configId);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let scheduledReportServiceInstance: ScheduledReportService | null = null;

/**
 * Get the singleton ScheduledReportService instance
 */
export function getScheduledReportService(): ScheduledReportService {
  if (!scheduledReportServiceInstance) {
    scheduledReportServiceInstance = new ScheduledReportService();
  }
  return scheduledReportServiceInstance;
}

/**
 * Reset the singleton (useful for testing)
 */
export function resetScheduledReportService(): void {
  scheduledReportServiceInstance = null;
}

export default ScheduledReportService;
