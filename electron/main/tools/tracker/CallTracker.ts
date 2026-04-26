/**
 * 调用追踪器
 * 追踪命令调用频率，检测重复执行，避免 Agent 陷入无效循环
 */

export class CallTracker {
  private history: Map<string, number[]> = new Map();

  /** 时间窗口（毫秒）：60 秒 */
  private readonly WINDOW_MS = 60000;

  /** 最大重复次数：5 次 */
  private readonly MAX_REPEATS = 5;

  /**
   * 记录一次命令调用
   */
  record(command: string): void {
    const now = Date.now();
    const normalized = this.normalize(command);
    const timestamps = this.history.get(normalized) || [];

    // 添加当前时间戳
    timestamps.push(now);

    // 只保留窗口内的记录
    const filtered = timestamps.filter((t) => now - t < this.WINDOW_MS);
    this.history.set(normalized, filtered);

    // 定期清理过期条目（防止内存泄漏）
    if (Math.random() < 0.1) {
      this.cleanup(now);
    }
  }

  /**
   * 获取命令在窗口内的重复次数
   */
  getRecentCount(command: string): number {
    const normalized = this.normalize(command);
    const timestamps = this.history.get(normalized) || [];
    return timestamps.length;
  }

  /**
   * 检查是否需要重复执行提醒
   */
  shouldWarn(command: string): boolean {
    return this.getRecentCount(command) >= this.MAX_REPEATS;
  }

  /**
   * 生成重复执行提醒
   */
  getRepeatWarning(command: string): string | null {
    const count = this.getRecentCount(command);
    if (count >= this.MAX_REPEATS) {
      return `⚠️ 该命令已连续执行 ${count} 次。如果一直失败，请检查命令是否正确，或考虑调整策略。`;
    }
    return null;
  }

  /**
   * 标准化命令（去除多余空格，统一格式）
   */
  private normalize(command: string): string {
    return command
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();
  }

  /**
   * 清理过期条目
   */
  private cleanup(now: number): void {
    const entries = Array.from(this.history.entries());
    for (const [key, timestamps] of entries) {
      const filtered = timestamps.filter((t) => now - t < this.WINDOW_MS);
      if (filtered.length === 0) {
        this.history.delete(key);
      } else {
        this.history.set(key, filtered);
      }
    }
  }

  /**
   * 重置所有记录（用于测试）
   */
  reset(): void {
    this.history.clear();
  }

  /**
   * 获取统计信息
   */
  getStats(): { totalCommands: number; uniqueCommands: number } {
    let total = 0;
    const values = Array.from(this.history.values());
    for (const timestamps of values) {
      total += timestamps.length;
    }
    return {
      totalCommands: total,
      uniqueCommands: this.history.size,
    };
  }
}

// 单例
let callTrackerInstance: CallTracker | null = null;

export function getCallTracker(): CallTracker {
  if (!callTrackerInstance) {
    callTrackerInstance = new CallTracker();
  }
  return callTrackerInstance;
}
