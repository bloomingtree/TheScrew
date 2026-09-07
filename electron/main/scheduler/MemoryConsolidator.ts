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
 *   - 用 target='agent' + message 让 AI 通过通用文件工具（read / edit / write / grep）自行整理
 *   - 不直接调 LLM：借 JobDispatcher → AgentRunner 走完整的工具循环
 *   - 状态文件 .lastConsolidate 仅存一个数字时间戳（ms），便于读取判断
 */

import { CronService } from './CronService';
import { dispatchJob } from './JobDispatcher';
import { CronJob } from './types';
import { getPathManager } from '../config/PathManager';
import { MEMORY_INDEX_MAX_LINES } from '../memory/MemoryStore';
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
const CONSOLIDATE_PROMPT = `【每日记忆复盘】请整理长期记忆（全部位于配置目录 memory/ 下，文件工具统一传 namespace="config"），按以下步骤执行：

**第 1 步：盘点素材**
- 用 glob（pattern="daily/*.md", namespace="config", path="memory"）列出近 7 天的 daily 笔记，再逐个 read 查看
- 若 daily 笔记很少或为空：回看当前对话历史中近期的用户消息和任务结果，从中提取值得长期记住的内容（这不是偷懒的借口——对话历史本身就是记忆素材）

**第 2 步：提炼到主题文件**（topics/ 目录，用 edit 原地更新已有条目，新主题可用 write 创建）
- 用户姓名、职业、语言/工具偏好、交互习惯 → topics/user-profile.md
- 项目路径、架构、关键文件、重要决策 → topics/project-facts.md
- 反复出现的 bug：症状 + 根因 + 解决方案 → topics/recurring-bugs.md
- 调试技巧、踩坑经验 → topics/debugging-notes.md

**第 3 步：维护索引**
- 新提炼的条目若足够重要，在 memory/MEMORY.md 索引中补充对应的一行摘要（edit 锚点插入）
- 检查 MEMORY.md 是否有过时、矛盾的条目，有则用 edit 更新或删除
- 索引保持精简（一行一条），超过 ${MEMORY_INDEX_MAX_LINES} 行时把低频内容下沉到 topics/ 文件

**要求**：
1. 先用 grep（namespace="config", path="memory"）确认是否已有相关条目，已存在则用 edit 更新原条目，禁止追加重复内容
2. 不提炼临时状态、工具调用细节等一次性信息，只提炼"反复出现"和"重要事实"
3. 若本次确实没有任何值得提炼的内容（连对话历史也没有），直接跳到收尾步骤，不要编造记忆
4. 收尾：把已提炼的 daily 文件移动到 memory/archive/YYYY-MM/ 目录归档（用 bash 的 mv，保留备份）
5. 最后更新状态文件（namespace=config，filepath="memory/.lastConsolidate"，content 为当前毫秒时间戳字符串）。注意：该文件每日覆盖，须先 read 一次再 write，否则会被文件工具的过期内容防护拦截`;

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
      // prompt 有更新时重建任务（任务里的旧 message 已持久化，不重建则新 prompt 永远不生效）
      if (existing.payload.message !== CONSOLIDATE_PROMPT) {
        console.log('[MemoryConsolidator] consolidate prompt 已更新，重建内置任务');
        await cronService.removeJob(existing.id);
        // 继续走下方的注册流程
      } else {
        console.log(`[MemoryConsolidator] 内置 consolidate 任务已存在 (id=${existing.id})，跳过注册`);
        return;
      }
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
