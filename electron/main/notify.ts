/**
 * 通知与窗口唤起工具
 *
 * 用于定时任务触发时：
 * - 弹出系统通知（Windows 任务栏通知中心）
 * - 唤起/聚焦主窗口、任务栏闪烁
 *
 * 注意：appUserModelId 必须在 index.ts 的 app.whenReady() 之前设置，
 * 否则 Windows 通知会显示为 "Electron" 而非应用名。
 */

import { Notification, BrowserWindow } from 'electron';

export interface NotifyOptions {
  /** 通知标题 */
  title: string;
  /** 通知正文 */
  body: string;
  /** 可选：关联对话 ID，点击通知时切换到该对话 */
  conversationId?: string;
  /** 可选：是否静默（不播放声音）。默认 true（按用户要求不要声音） */
  silent?: boolean;
}

/**
 * 显示系统通知。
 * 点击通知会唤起主窗口（可选切换到关联对话）。
 */
export function showNotification(opts: NotifyOptions): void {
  if (!Notification.isSupported()) {
    console.warn('[Notify] System notifications not supported on this platform');
    return;
  }

  try {
    const n = new Notification({
      title: opts.title,
      body: opts.body,
      silent: opts.silent !== false, // 默认静默
    });

    n.on('click', () => {
      activateMainWindow(opts.conversationId);
      n.close();
    });

    n.show();
  } catch (e) {
    console.error('[Notify] Failed to show notification:', e);
  }
}

/**
 * 唤起主窗口：恢复最小化、显示、聚焦、任务栏闪烁。
 * 可选附带 conversationId，通知前端切换到该对话。
 */
export function activateMainWindow(conversationId?: string): void {
  const windows = BrowserWindow.getAllWindows();
  if (windows.length === 0) {
    console.warn('[Notify] No browser window to activate');
    return;
  }

  const win = windows[0];

  if (win.isMinimized()) {
    win.restore();
  }

  // show + focus 即使窗口已可见也无副作用
  win.show();
  win.focus();

  // 任务栏闪烁（Windows）/ Dock 弹跳（macOS，需 app.dock.bounce）
  win.flashFrame(true);

  // 通知前端切换到关联对话（前端监听 conversation:navigateTo）
  if (conversationId) {
    try {
      win.webContents.send('conversation:navigateTo', conversationId);
    } catch (e) {
      // webContents 可能未就绪，忽略
      console.warn('[Notify] Failed to send navigateTo:', e);
    }
  }
}

/**
 * 停止任务栏闪烁（在窗口获得焦点时调用）。
 */
export function stopFlashing(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.flashFrame(false);
  }
}
