/**
 * 任务列表 IPC
 * 暴露 AI 工具（TaskTools）持久化的 tasks.json 给前端面板，
 * 让用户能在 UI 上看到 AI 创建的任务（关闭程序后仍保留）。
 *
 * 数据流：
 * - 前端 → tasks:list → loadStore().tasks
 * - AI 工具修改任务后 → broadcast 'tasks:changed' → 前端刷新
 */
import { ipcMain, BrowserWindow } from 'electron';
import { listAllTasksForIPC, updateTaskStatusForIPC } from '../tools/TaskTools';

let registered = false;

export function registerTasksHandlers(): void {
  if (registered) return;
  registered = true;

  ipcMain.handle('tasks:list', async () => {
    try {
      const tasks = listAllTasksForIPC();
      return { success: true, tasks };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e), tasks: [] };
    }
  });

  ipcMain.handle('tasks:updateStatus', async (_e, { id, status }) => {
    try {
      const task = updateTaskStatusForIPC(id, status);
      // 通知所有窗口刷新
      broadcastTasksChanged();
      return { success: true, task };
    } catch (e: any) {
      return { success: false, error: e?.message || String(e) };
    }
  });
}

/**
 * 通知所有渲染进程任务列表已变更（由 ToolManager 在 task_* 工具执行后调用）
 */
export function broadcastTasksChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('tasks:changed');
  }
}
