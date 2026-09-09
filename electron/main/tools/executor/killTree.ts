/**
 * 进程树终止工具
 *
 * 背景（2026-09-07 评测发现）：child.kill() 在 Windows 上只终止直接子进程，
 * 孙进程会成为孤儿。典型事故链：bash 超时 → 杀掉 busybox.exe，但脚本拉起的
 * python.exe 连同其 COM 激活的 EXCEL.EXE 存活 → 僵尸 EXCEL.EXE 让后续所有
 * COM 调用行为异常（Visible 设不了 / Workbooks 取不到）。
 *
 * Windows 用 taskkill /PID <pid> /T /F 终止整棵进程树，其他平台回退 signal。
 */
import { execFile } from 'child_process';

export function killProcessTree(
  // kill 签名放宽为 any：兼容 ChildProcess（Signals|number）与 cross-spawn 的不同声明
  child: { kill: (signal?: any) => any; pid?: number },
  signal: any = 'SIGKILL'
): void {
  if (process.platform === 'win32' && child.pid) {
    try {
      // /T 连同子进程一起终止；fire-and-forget，close 事件由进程树死亡触发
      execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], () => undefined);
      return;
    } catch {
      // taskkill 不可用时回退 signal
    }
  }
  try {
    child.kill(signal);
  } catch {
    // ignore
  }
}
