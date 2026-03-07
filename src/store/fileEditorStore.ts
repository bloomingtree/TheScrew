/**
 * File Editor Store - 文件编辑器状态管理
 *
 * 使用 Zustand 管理文件编辑状态：
 * - 打开的文件列表
 * - 文件内容缓存
 * - 未保存变化跟踪
 * - 当前活动文件
 */

import { create } from 'zustand';
import { getLanguageFromPath, getFileName } from '@/utils/monacoLanguages';

export interface EditorFile {
  /** 文件路径 */
  path: string;
  /** 文件名 */
  name: string;
  /** 文件内容 */
  content: string;
  /** 是否有未保存变化 */
  isModified: boolean;
  /** 语言类型 */
  language: string;
  /** 只读模式 */
  readOnly?: boolean;
}

interface FileEditorState {
  /** 打开的文件列表（按打开顺序） */
  openFiles: EditorFile[];
  /** 当前活动的文件路径 */
  activeFile: string | null;
  /** 文件内容缓存（路径 -> 内容） */
  contentCache: Map<string, string>;

  // Actions
  openFile: (path: string, content: string, readOnly?: boolean) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  isFileModified: (path: string) => boolean;
  getFile: (path: string) => EditorFile | undefined;
  refreshFile: (path: string) => Promise<void>;
  reset: () => void;
}

export const useFileEditorStore = create<FileEditorState>((set, get) => ({
  openFiles: [],
  activeFile: null,
  contentCache: new Map(),

  // 打开文件
  openFile: (path, content, readOnly = false) => {
    const state = get();
    const language = getLanguageFromPath(path);
    const name = getFileName(path);

    // 检查文件是否已打开
    const existingFile = state.openFiles.find(f => f.path === path);

    if (existingFile) {
      // 如果已打开，只切换活动文件
      set({ activeFile: path });
      return;
    }

    // 创建新文件记录
    const newFile: EditorFile = {
      path,
      name,
      content,
      isModified: false,
      language,
      readOnly,
    };

    // 缓存内容
    const newCache = new Map(state.contentCache);
    newCache.set(path, content);

    set({
      openFiles: [...state.openFiles, newFile],
      activeFile: path,
      contentCache: newCache,
    });
  },

  // 关闭文件
  closeFile: (path) => {
    const state = get();
    const file = state.openFiles.find(f => f.path === path);

    if (!file) return;

    // 检查是否有未保存变化
    if (file.isModified) {
      const confirmed = confirm(`文件 "${file.name}" 有未保存的变化，确定要关闭吗？`);
      if (!confirmed) return;
    }

    const newOpenFiles = state.openFiles.filter(f => f.path !== path);
    const newCache = new Map(state.contentCache);
    newCache.delete(path);

    // 如果关闭的是活动文件，切换到其他文件
    let newActiveFile = state.activeFile;
    if (state.activeFile === path) {
      const index = state.openFiles.findIndex(f => f.path === path);
      newActiveFile = newOpenFiles.length > 0
        ? newOpenFiles[Math.max(0, index - 1)].path
        : null;
    }

    set({
      openFiles: newOpenFiles,
      activeFile: newActiveFile,
      contentCache: newCache,
    });
  },

  // 设置活动文件
  setActiveFile: (path) => {
    set({ activeFile: path });
  },

  // 更新文件内容
  updateFileContent: (path, content) => {
    const state = get();
    const file = state.openFiles.find(f => f.path === path);

    if (!file) return;

    // 更新内容缓存
    const newCache = new Map(state.contentCache);
    newCache.set(path, content);

    // 检查是否有变化
    const isModified = content !== file.content;

    // 更新文件列表
    const newOpenFiles = state.openFiles.map(f =>
      f.path === path
        ? { ...f, content, isModified }
        : f
    );

    set({
      openFiles: newOpenFiles,
      contentCache: newCache,
    });
  },

  // 保存文件
  saveFile: async (path) => {
    const state = get();
    const file = state.openFiles.find(f => f.path === path);

    if (!file) return;

    try {
      // 调用 IPC 保存文件
      const result = await (window as any).electronAPI.fileEditor.saveFile(path, file.content);

      if (result.success) {
        // 更新文件状态
        const newOpenFiles = state.openFiles.map(f =>
          f.path === path
            ? { ...f, isModified: false }
            : f
        );

        // 更新缓存（保存后重新读取以确认）
        const newCache = new Map(state.contentCache);
        newCache.set(path, file.content);

        set({
          openFiles: newOpenFiles,
          contentCache: newCache,
        });
      } else {
        console.error('Failed to save file:', result.error);
        alert(`保存失败: ${result.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('Failed to save file:', error);
      alert(`保存失败: ${error}`);
    }
  },

  // 保存所有文件
  saveAllFiles: async () => {
    const state = get();
    const modifiedFiles = state.openFiles.filter(f => f.isModified);

    for (const file of modifiedFiles) {
      await get().saveFile(file.path);
    }
  },

  // 检查文件是否有未保存变化
  isFileModified: (path) => {
    const state = get();
    const file = state.openFiles.find(f => f.path === path);
    return file?.isModified || false;
  },

  // 获取文件
  getFile: (path) => {
    const state = get();
    return state.openFiles.find(f => f.path === path);
  },

  // 刷新文件（从磁盘重新读取）
  refreshFile: async (path) => {
    try {
      const result = await (window as any).electronAPI.fileEditor.readFile(path);

      if (result.success) {
        const state = get();
        const file = state.openFiles.find(f => f.path === path);

        if (file) {
          const newCache = new Map(state.contentCache);
          newCache.set(path, result.content);

          const newOpenFiles = state.openFiles.map(f =>
            f.path === path
              ? { ...f, content: result.content, isModified: false }
              : f
          );

          set({
            openFiles: newOpenFiles,
            contentCache: newCache,
          });
        }
      }
    } catch (error) {
      console.error('Failed to refresh file:', error);
    }
  },

  // 重置状态
  reset: () => {
    set({
      openFiles: [],
      activeFile: null,
      contentCache: new Map(),
    });
  },
}));
