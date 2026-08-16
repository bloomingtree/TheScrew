/**
 * MemoryConsolidator - 每日记忆整理任务（P2-3）
 *
 * 职责：
 *   1. 注册一个内置 cron 任务（每天凌晨 3:00），让 AI 把近 7 天 daily 笔记
 *      提炼到 topics/ 子文件（user-profile / project-facts 等）。
 *   2. 启动时检查"上次 consolidate 时间"（.config/memory/.lastConsolidate 状态文件），
 *      若距今 > 24 小时则立即派发一次 consolidate 任务（防止用户凌晨未开机）。
 *
 * 实现要点：
 *   - 用 CronService.addJob 注册内置任务，幂等（jobId 固定，已存在则跳过）
 *   - 用 target='agent' + message 让 AI 通过 memory_save / memory_read 工具自行整理
 *   - 不直接调 LLM：借 JobDispatcher → AgentRunner 走完整的工具循环
 *   - 状态文件 .lastConsolidate 仅存一个数字时间戳（ms），便于读取判断
 */

import { CronService } from './CronService';
import { dispatchJob } from './JobDispatcher';
import { CronJob } from './types';
import { getPathManager } from '../config/PathManager';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

// ============================================================================
// 常量
// ============================================================================

/** 内置 consolidate 任务的固定名称（用于幂等检查；jobId 由 addJob 内部生成） */
export const CONSOLIDATE_JOB_NAME = '每日记忆整理';

/** 状态文件路径：.config/memory/.lastConsolidate */
function getLastConsolidatePath(): string {
  return join(getPathManager().getMemoryPath(), '.lastConsolidate');
}

/** Agent 要执行的 consolidate prompt */
const CONSOLIDATE_PROMPT = `请检查近 7 天的 daily 笔记（daily/*.md），把反复出现的内容（用户偏好、项目事实、调试经验等）通过 memory_save 工具提炼到对应的 topics/ 文件：

- 用户姓名、职业、语言/工具偏好 → topics/user-profile.md
- 项目路径、架构、关键文件 → topics/project-facts.md
- 反复出现的 bug 和修复方案 → topics/recurring-bugs.md
- 调试技巧和经验 → topics/debugging-notes.md

**要求**：
1. 先用 memory_search 确认是否已有相关条目，已存在则用 mode=merge-section 更新
2. 不要复制临时状态或工具调用细节，只提炼"反复出现"和"重要事实"
3. 完成后，把已提炼的 daily 内容压缩或归档到 archive/YYYY-MM/ 目录（保留原始文件备份）
4. 最后更新 .lastConsolidate 文件为当前时间戳（用 write_file 写入 Date.now() 的字符串）`;

/** cron 表达式：每天凌晨 3:00 */
const CONSOLIDATE_CRON_EXPR = '0 3 * * *';

// ============================================================================
// 注册函数
// ============================================================================

/**
 * 注册每日凌晨的 consolidate 任务（幂等）。
 *
 * 在 CronService.start() 之后调用。按任务名查重（CronService.addJob 用 randomUUID，
 * 无法指定固定 id），若已存在同名任务则不重复添加。
 *
 * @param cronService 已启动的 CronService 实例
 */
export async function registerMemoryConsolidateJob(cronService: CronService): Promise<void> {
  try {
    // 按 name 查重（includeDisabled=true 确保即使被禁用也能识别）
    const allJobs = await cronService.listJobs(true);
    const existing = allJobs.find(j => j.name === CONSOLIDATE_JOB_NAME);
    if (existing) {
      console.log(`[MemoryConsolidator] 内置 consolidate 任务已存在 (id=${existing.id})，跳过注册`);
      return;
    }

    // 注册：cron 表达式每天 3:00 执行
    await cronService.addJob(
      CONSOLIDATE_JOB_NAME,
      { kind: 'cron', expr: CONSOLIDATE_CRON_EXPR },
      CONSOLIDATE_PROMPT,
      {
        target: 'agent',
      }
    );

    console.log(`[MemoryConsolidator] 已注册每日凌晨 3:00 的记忆整理任务`);
  } catch (e: any) {
    console.error('[MemoryConsolidator] 注册内置任务失败:', e);
  }
}

/**
 * 启动时检查：若距上次 consolidate > 24 小时则立即派发一次。
 *
 * 通过 JobDispatcher.dispatchJob 异步执行，不阻塞启动流程。
 */
export async function checkAndRunConsolidateOnStartup(): Promise<void> {
  try {
    const lastPath = getLastConsolidatePath();
    let lastMs = 0;
    if (existsSync(lastPath)) {
      try {
        const content = readFileSync(lastPath, 'utf-8').trim();
        lastMs = parseInt(content, 10) || 0;
      } catch {
        lastMs = 0;
      }
    }

    const now = Date.now();
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;

    if (lastMs > 0 && now - lastMs < ONE_DAY_MS) {
      console.log(`[MemoryConsolidator] 距上次 consolidate 仅 ${Math.round((now - lastMs) / 3600000)}h < 24h，跳过启动补偿`);
      return;
    }

    console.log('[MemoryConsolidator] 启动补偿：距上次 consolidate > 24h，立即派发一次');

    // 构造虚拟 job，复用 JobDispatcher 走 agent turn
    const virtualJob: CronJob = {
      id: 'memory_consolidate_startup',
      name: `${CONSOLIDATE_JOB_NAME}（启动补偿）`,
      enabled: true,
      schedule: { kind: 'every', every_ms: 0 },
      payload: {
        target: 'agent',
        message: CONSOLIDATE_PROMPT,
      },
      state: {},
      created_at_ms: now,
      updated_at_ms: now,
      delete_after_run: false,
    };

    // fire-and-forget；catch 仅 log
    dispatchJob(virtualJob, 'cron').catch((e: unknown) => {
      console.error('[MemoryConsolidator] 启动补偿执行失败:', e);
    });

    // 立即更新状态文件，避免下次启动重复触发（即使本次执行失败）
    writeLastConsolidate(now);
  } catch (e: any) {
    console.error('[MemoryConsolidator] 启动补偿检查失败:', e);
  }
}

// ============================================================================
// 内部辅助
// ============================================================================

/**
 * 更新 .lastConsolidate 状态文件
 */
export function writeLastConsolidate(timestamp: number = Date.now()): void {
  try {
    const lastPath = getLastConsolidatePath();
    const dir = join(lastPath, '..');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(lastPath, String(timestamp), 'utf-8');
  } catch (e: any) {
    console.warn('[MemoryConsolidator] 写 .lastConsolidate 失败（非致命）:', e);
  }
}
