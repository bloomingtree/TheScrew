import { useEffect, useRef } from 'react';

/**
 * 监听预览文件磁盘变更的共享 hook。
 *
 * 当被预览的文件在磁盘上发生变化（外部编辑、AI 工具写入等）时，
 * 调用 onFileChanged 回调，组件可据此重新加载内容。
 *
 * 实现要点（避免 race condition）：
 * 1. onFileChanged 订阅必须同步立即注册，不能在 await 之后
 * 2. watchFile IPC 调用并行执行，不阻塞监听器注册
 * 3. 用 ref 保存最新 callback 和 path，避免 effect 频繁重订阅
 *
 * @param filepath 当前预览的文件路径
 * @param onFileChanged 文件变更回调（主进程已做 300ms 防抖）
 * @param enabled 是否启用监听，默认 true（编辑模式下可设为 false 避免覆盖用户输入）
 */
export function useFilePreviewWatcher(
  filepath: string,
  onFileChanged: () => void,
  enabled: boolean = true
) {
  // 用 ref 保存最新回调，避免 effect 频繁重订阅 IPC 事件
  const cbRef = useRef(onFileChanged);
  cbRef.current = onFileChanged;

  // 当前监听的路径（用于过滤事件），避免闭包捕获旧 filepath
  const pathRef = useRef(filepath);
  pathRef.current = filepath;

  useEffect(() => {
    if (!enabled || !filepath) return;

    // 路径规范化（用于事件匹配）
    const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();

    // 1. 同步立即订阅 filePreview:fileChanged 事件
    //    不能在 await 之后，否则 StrictMode 双挂载或快速重渲染时监听器丢失
    //    注意：preload 中的 onFileChanged 已封装为 (data) => void，不需要 _event 参数
    const listener = (data: { path: string }) => {
      if (!data?.path) return;
      if (normalize(data.path) === normalize(pathRef.current)) {
        cbRef.current();
      }
    };
    // 注意：preload 中 onFileChanged 返回的是清理函数
    const unsubscribe = window.electronAPI.filePreview.onFileChanged(listener);

    // 2. 通知主进程开始监听该文件（异步，不阻塞订阅）
    window.electronAPI.filePreview.watchFile(filepath).catch(() => {
      // 忽略：监听失败不影响预览本身
    });

    return () => {
      // 先取消事件订阅
      try { unsubscribe(); } catch { /* ignore */ }
      // 再通知主进程停止监听
      try {
        window.electronAPI.filePreview.unwatchFile(filepath);
      } catch {
        // ignore
      }
    };
  }, [filepath, enabled]);
}
