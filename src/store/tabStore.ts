import { create } from 'zustand';
import { MessageSquare, File, Settings, BarChart3, Zap, History, Folder } from 'lucide-react';

export type TabType = 'chat' | 'file' | 'preview' | 'files' | 'history' | 'reports' | 'workflows' | 'analytics';

export interface Tab {
  id: string;
  type: TabType;
  title: string;
  content?: any; // 标签特定内容（文件路径、对话ID等）
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  isActive: boolean;
  isModified?: boolean; // 显示未保存标记
  canClose?: boolean; // 聊天标签默认不可关闭
}

export interface Panel {
  id: string;
  position: 'left' | 'right';
  activeTabId: string | null;
  tabs: Tab[];
  isVisible: boolean;
}

interface TabStoreState {
  // 面板管理
  leftPanel: Panel;
  rightPanel: Panel;
  isSplit: boolean; // 是否启用分屏

  // 操作方法
  openTab: (tab: Omit<Tab, 'id' | 'isActive'>, panelId?: 'left' | 'right') => string;
  closeTab: (tabId: string, panelId?: 'left' | 'right') => void;
  setActiveTab: (tabId: string, panelId?: 'left' | 'right') => void;
  moveTab: (tabId: string, fromPanel: 'left' | 'right', toPanel: 'left' | 'right') => void;
  updateTab: (tabId: string, updates: Partial<Tab>) => void;

  // 分屏操作
  toggleSplit: () => void;
  setSplitDirection: (direction: 'horizontal' | 'vertical') => void;

  // 面板可见性
  setPanelVisible: (panel: 'left' | 'right', visible: boolean) => void;
}

// 生成唯一 ID
const generateTabId = () => `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// 获取标签图标
const getTabIcon = (type: TabType) => {
  switch (type) {
    case 'chat': return MessageSquare;
    case 'file':
    case 'preview': return File;
    case 'files': return Folder;
    case 'history': return History;
    case 'reports': return BarChart3;
    case 'workflows': return Zap;
    case 'analytics': return BarChart3;
    default: return File;
  }
};

export const useTabStore = create<TabStoreState>((set, get) => {
  // 创建默认聊天标签
  const createChatTab = (): Tab => ({
    id: generateTabId(),
    type: 'chat',
    title: '聊天',
    icon: MessageSquare,
    isActive: true,
    canClose: false,
  });

  // 初始左面板（包含聊天标签）
  const initialLeftPanel: Panel = {
    id: 'left',
    position: 'left',
    activeTabId: null, // 稍后设置
    tabs: [createChatTab()],
    isVisible: true,
  };
  initialLeftPanel.activeTabId = initialLeftPanel.tabs[0].id;

  // 初始右面板（隐藏）
  const initialRightPanel: Panel = {
    id: 'right',
    position: 'right',
    activeTabId: null,
    tabs: [],
    isVisible: false,
  };

  return {
    // 初始状态
    leftPanel: initialLeftPanel,
    rightPanel: initialRightPanel,
    isSplit: false,

    // 打开标签
    openTab: (tab, panelId = 'left') => {
      const state = get();
      const targetPanel = panelId === 'left' ? state.leftPanel : state.rightPanel;
      const icon = tab.icon || getTabIcon(tab.type);

      // 检查是否已存在相同内容的标签
      const existingTab = targetPanel.tabs.find(
        t => t.type === tab.type && t.content?.filepath === tab.content?.filepath
      );

      if (existingTab) {
        // 如果标签已存在，激活它
        set({
          [`${panelId}Panel`]: {
            ...targetPanel,
            activeTabId: existingTab.id,
            tabs: targetPanel.tabs.map(t =>
              t.id === existingTab.id ? { ...t, isActive: true } : { ...t, isActive: false }
            ),
          },
        });
        return existingTab.id;
      }

      // 创建新标签
      const newTab: Tab = {
        ...tab,
        id: generateTabId(),
        icon,
        isActive: true,
      };

      // 将其他标签设为非活动
      const updatedTabs = targetPanel.tabs.map(t => ({ ...t, isActive: false }));

      set({
        [`${panelId}Panel`]: {
          ...targetPanel,
          activeTabId: newTab.id,
          tabs: [...updatedTabs, newTab],
          isVisible: true,
        },
        isSplit: panelId === 'right' ? true : state.isSplit,
      });

      return newTab.id;
    },

    // 关闭标签
    closeTab: (tabId, panelId) => {
      const state = get();

      // 确定在哪个面板
      let targetPanel = state.leftPanel;
      let actualPanelId: 'left' | 'right' = 'left';

      if (panelId) {
        actualPanelId = panelId;
        targetPanel = panelId === 'left' ? state.leftPanel : state.rightPanel;
      } else {
        // 在两个面板中查找
        if (state.leftPanel.tabs.find(t => t.id === tabId)) {
          targetPanel = state.leftPanel;
        } else if (state.rightPanel.tabs.find(t => t.id === tabId)) {
          targetPanel = state.rightPanel;
          actualPanelId = 'right';
        }
      }

      const tabToClose = targetPanel.tabs.find(t => t.id === tabId);
      if (!tabToClose || tabToClose.canClose === false) {
        return; // 不允许关闭不可关闭的标签
      }

      const filteredTabs = targetPanel.tabs.filter(t => t.id !== tabId);
      const wasActive = tabToClose.isActive;

      // 如果关闭的是活动标签，激活其他标签
      let newActiveTabId = targetPanel.activeTabId;
      if (wasActive && filteredTabs.length > 0) {
        // 激活前一个标签或第一个标签
        const tabIndex = targetPanel.tabs.findIndex(t => t.id === tabId);
        const newActiveIndex = tabIndex > 0 ? tabIndex - 1 : 0;
        newActiveTabId = filteredTabs[newActiveIndex]?.id || null;
        filteredTabs[newActiveIndex!] = { ...filteredTabs[newActiveIndex!], isActive: true };
      } else if (filteredTabs.length === 0) {
        newActiveTabId = null;
      }

      const updatedPanel: Panel = {
        ...targetPanel,
        activeTabId: newActiveTabId,
        tabs: filteredTabs,
        isVisible: filteredTabs.length > 0,
      };

      set({
        [`${actualPanelId}Panel`]: updatedPanel,
        // 如果右面板没有标签了，关闭分屏
        isSplit: actualPanelId === 'right' && filteredTabs.length === 0 ? false : state.isSplit,
      });
    },

    // 设置活动标签
    setActiveTab: (tabId, panelId) => {
      const state = get();

      // 确定在哪个面板
      let targetPanel = state.leftPanel;
      let actualPanelId: 'left' | 'right' = 'left';

      if (panelId) {
        actualPanelId = panelId;
        targetPanel = panelId === 'left' ? state.leftPanel : state.rightPanel;
      } else {
        // 在两个面板中查找
        if (state.leftPanel.tabs.find(t => t.id === tabId)) {
          targetPanel = state.leftPanel;
        } else if (state.rightPanel.tabs.find(t => t.id === tabId)) {
          targetPanel = state.rightPanel;
          actualPanelId = 'right';
        }
      }

      set({
        [`${actualPanelId}Panel`]: {
          ...targetPanel,
          activeTabId: tabId,
          tabs: targetPanel.tabs.map(t => ({
            ...t,
            isActive: t.id === tabId,
          })),
        },
      });
    },

    // 移动标签到另一个面板
    moveTab: (tabId, fromPanel, toPanel) => {
      const state = get();
      const sourcePanel = fromPanel === 'left' ? state.leftPanel : state.rightPanel;
      const targetPanel = toPanel === 'left' ? state.leftPanel : state.rightPanel;

      const tabToMove = sourcePanel.tabs.find(t => t.id === tabId);
      if (!tabToMove) return;

      // 从源面板移除
      const sourceUpdated = {
        ...sourcePanel,
        tabs: sourcePanel.tabs.filter(t => t.id !== tabId),
        activeTabId: sourcePanel.activeTabId === tabId
          ? sourcePanel.tabs.find(t => t.id !== tabId)?.id || null
          : sourcePanel.activeTabId,
      };

      // 添加到目标面板
      const targetUpdated = {
        ...targetPanel,
        tabs: [...targetPanel.tabs, { ...tabToMove, isActive: true }],
        activeTabId: tabId,
        isVisible: true,
      };

      // 将目标面板其他标签设为非活动
      targetUpdated.tabs = targetUpdated.tabs.map(t =>
        t.id === tabId ? t : { ...t, isActive: false }
      );

      set({
        [`${fromPanel}Panel`]: sourceUpdated,
        [`${toPanel}Panel`]: targetUpdated,
        isSplit: true,
      });
    },

    // 更新标签
    updateTab: (tabId, updates) => {
      const state = get();

      // 在两个面板中查找并更新
      ['left', 'right'].forEach((panelId: 'left' | 'right') => {
        const panel = panelId === 'left' ? state.leftPanel : state.rightPanel;
        const tabExists = panel.tabs.find(t => t.id === tabId);

        if (tabExists) {
          set({
            [`${panelId}Panel`]: {
              ...panel,
              tabs: panel.tabs.map(t =>
                t.id === tabId ? { ...t, ...updates } : t
              ),
            },
          });
        }
      });
    },

    // 切换分屏
    toggleSplit: () => {
      const state = get();
      const newSplitState = !state.isSplit;

      if (newSplitState) {
        // 开启分屏：将聊天标签移到右侧面板
        const chatTab = state.leftPanel.tabs.find(t => t.type === 'chat');
        if (chatTab) {
          // 从左面板移除聊天标签
          const leftWithoutChat = {
            ...state.leftPanel,
            tabs: state.leftPanel.tabs.filter(t => t.type !== 'chat'),
            activeTabId: state.leftPanel.activeTabId === chatTab.id
              ? state.leftPanel.tabs.find(t => t.type !== 'chat')?.id || null
              : state.leftPanel.activeTabId,
            isVisible: state.leftPanel.tabs.filter(t => t.type !== 'chat').length > 0,
          };

          // 将聊天标签添加到右面板并设为活动
          const rightWithChat = {
            ...state.rightPanel,
            tabs: [{ ...chatTab, isActive: true }, ...state.rightPanel.tabs.map(t => ({ ...t, isActive: false }))],
            activeTabId: chatTab.id,
            isVisible: true,
          };

          set({
            isSplit: true,
            leftPanel: leftWithoutChat,
            rightPanel: rightWithChat,
          });
        } else {
          // 没有聊天标签，正常开启分屏
          set({
            isSplit: true,
            rightPanel: {
              ...state.rightPanel,
              isVisible: true,
            },
          });
        }
      } else {
        // 关闭分屏：将聊天标签移回左侧面板
        const chatTab = state.rightPanel.tabs.find(t => t.type === 'chat');
        if (chatTab) {
          // 将聊天标签移回左面板
          const leftWithChat = {
            ...state.leftPanel,
            tabs: [...state.leftPanel.tabs.map(t => ({ ...t, isActive: false })), { ...chatTab, isActive: true }],
            activeTabId: chatTab.id,
            isVisible: true,
          };

          // 从右面板移除聊天标签
          const rightWithoutChat = {
            ...state.rightPanel,
            tabs: state.rightPanel.tabs.filter(t => t.type !== 'chat'),
            activeTabId: state.rightPanel.activeTabId === chatTab.id
              ? state.rightPanel.tabs.find(t => t.type !== 'chat')?.id || null
              : state.rightPanel.activeTabId,
            isVisible: false,
          };

          set({
            isSplit: false,
            leftPanel: leftWithChat,
            rightPanel: rightWithoutChat,
          });
        } else {
          // 没有聊天标签，正常关闭分屏
          set({
            isSplit: false,
            rightPanel: {
              ...state.rightPanel,
              isVisible: false,
            },
          });
        }
      }
    },

    // 设置分屏方向
    setSplitDirection: (direction) => {
      // 预留接口，用于后续实现垂直分屏
      console.log('Split direction:', direction);
    },

    // 设置面板可见性
    setPanelVisible: (panel, visible) => {
      const state = get();
      const targetPanel = panel === 'left' ? state.leftPanel : state.rightPanel;

      set({
        [`${panel}Panel`]: {
          ...targetPanel,
          isVisible: visible,
        },
        // 左侧面板始终可见
        isSplit: panel === 'right' ? (visible ? true : state.isSplit) : state.isSplit,
      });
    },
  };
});
