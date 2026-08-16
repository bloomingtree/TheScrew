/**
 * file-lock.ts — 进程级互斥文件锁
 *
 * 用于防止多个 officecli 进程并发写同一 Office 文档导致「后写覆盖前写」的数据丢失。
 *
 * 机制：
 * - 锁文件 = 目标路径 + '.lock'
 * - 使用 fs.writeFileSync(lock, data, { flag: 'wx' }) 原子创建（文件已存在则抛 EEXIST）
 * - 获取失败时重试 N 次，每次间隔 100ms
 * - 通过 mtime 检测陈旧锁（>30s 视为僵死，可强制接管）
 * - finally 阶段删除锁文件，仅当锁内容中的 PID 与当前进程一致时才删
 *
 * 注意：这是「尽力而为」的协作锁，无法防御强行 kill -9 后的孤儿锁文件，
 * 但能覆盖评测报告中识别的「多 AI 工具并发触发」典型场景。
 */

import * as fs from 'fs';
import * as path from 'path';

const LOCK_SUFFIX = '.lock';
const RETRY_INTERVAL_MS = 100;
const STALE_MS = 30 * 1000;

export interface LockHandle {
  lockPath: string;
  token: string;
}

/**
 * 获取文件锁。返回锁句柄，必须传给 releaseFileLock 释放。
 * 重试 maxRetries 次后仍获取失败则抛错。
 */
export async function acquireFileLock(
  target: string,
  maxRetries = 50,
): Promise<LockHandle> {
  const lockPath = target + LOCK_SUFFIX;
  const token = `${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 检测陈旧锁：如果存在且 mtime 超过 STALE_MS，强制接管
    if (fs.existsSync(lockPath)) {
      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_MS) {
          // 陈旧锁，可安全删除后重试
          fs.unlinkSync(lockPath);
        }
      } catch {
        // stat/unlink 失败时忽略，下次重试
      }
    }

    try {
      // flag: 'wx' → 文件存在时抛 EEXIST
      fs.writeFileSync(lockPath, token, { flag: 'wx' });
      return { lockPath, token };
    } catch (err: any) {
      if (err.code !== 'EEXIST') {
        throw new Error(`Failed to acquire lock ${lockPath}: ${err.message}`);
      }
      // 锁被占用，等待后重试
      await sleep(RETRY_INTERVAL_MS);
    }
  }

  throw new Error(
    `File is locked by another process after ${maxRetries + 1} attempts: ${lockPath}` +
    ` (if this is incorrect, manually delete the .lock file)`,
  );
}

/**
 * 释放文件锁。仅当锁文件内容与当前 token 匹配时才删除，
 * 避免误删被其他进程接管的锁。
 */
export function releaseFileLock(handle: LockHandle): void {
  try {
    const content = fs.readFileSync(handle.lockPath, 'utf-8');
    if (content === handle.token) {
      fs.unlinkSync(handle.lockPath);
    }
  } catch {
    // 锁文件不存在或读取失败时忽略
  }
}

/**
 * 用文件锁包裹一个异步操作，自动获取/释放锁。
 * 用法：const result = await withFileLock(targetPath, async () => { ... });
 */
export async function withFileLock<T>(
  target: string,
  fn: () => Promise<T>,
): Promise<T> {
  const handle = await acquireFileLock(target);
  try {
    return await fn();
  } finally {
    releaseFileLock(handle);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 暴露 lockPath 计算函数，便于测试
export function getLockPath(target: string): string {
  return target + LOCK_SUFFIX;
}

// 抑制未使用的 path 导入警告（保留用于未来扩展）
void path;
