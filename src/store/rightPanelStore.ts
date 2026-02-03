import { create } from 'zustand';

export type RightPanelTab = 'preview' | 'files' | 'history';

export interface PreviewFile {
  filepath: string;
  filename: string;
  timestamp: number;
}

interface RightPanelState {
  // 面板状态
  isOpen: boolean;
  width: number;
  minWidth: number;
  maxWidth: number;
  isResizing: boolean;

  // 当前标签页
  activeTab: RightPanelTab;

  // 文件预览相关
  previewFiles: PreviewFile[];
  currentPreviewFile: string | null;

  // 操作方法
  setOpen: (open: boolean) => void;
  setWidth: (width: number) => void;
  setResizing: (resizing: boolean) => void;
  setActiveTab: (tab: RightPanelTab) => void;

  // 文件预览操作
  openPreview: (filepath: string) => void;
  closePreview: () => void;
  addPreviewFile: (filepath: string) => void;
  clearPreviewFiles: () => void;
  setCurrentPreviewFile: (filepath: string | null) => void;
}

export const useRightPanelStore = create<RightPanelState>((set, get) => ({
  // 初始状态
  isOpen: false,
  width: 600,
  minWidth: 400,
  maxWidth: 1000,
  isResizing: false,
  activeTab: 'preview',
  previewFiles: [],
  currentPreviewFile: null,

  // 面板操作
  setOpen: (open) => set({ isOpen: open }),

  setWidth: (width) => {
    const state = get();
    const clampedWidth = Math.max(state.minWidth, Math.min(state.maxWidth, width));
    set({ width: clampedWidth });
  },

  setResizing: (resizing) => set({ isResizing: resizing }),

  setActiveTab: (tab) => set({ activeTab: tab }),

  // 文件预览操作
  openPreview: (filepath) => {
    const filename = filepath.split(/[\\/]/).pop() || filepath;
    const newFile: PreviewFile = {
      filepath,
      filename,
      timestamp: Date.now(),
    };

    set((state) => {
      // 检查文件是否已存在
      const exists = state.previewFiles.some(f => f.filepath === filepath);
      const updatedFiles = exists
        ? state.previewFiles.map(f => f.filepath === filepath ? newFile : f)
        : [...state.previewFiles, newFile];

      return {
        isOpen: true,
        activeTab: 'preview',
        previewFiles: updatedFiles,
        currentPreviewFile: filepath,
      };
    });
  },

  closePreview: () => set({ isOpen: false }),

  addPreviewFile: (filepath) => {
    const filename = filepath.split(/[\\/]/).pop() || filepath;
    const newFile: PreviewFile = {
      filepath,
      filename,
      timestamp: Date.now(),
    };

    set((state) => {
      const exists = state.previewFiles.some(f => f.filepath === filepath);
      if (exists) return state;
      return {
        previewFiles: [...state.previewFiles, newFile],
      };
    });
  },

  clearPreviewFiles: () => set({
    previewFiles: [],
    currentPreviewFile: null,
  }),

  setCurrentPreviewFile: (filepath) => set({ currentPreviewFile: filepath }),
}));
