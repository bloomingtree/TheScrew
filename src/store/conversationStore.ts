import { create } from 'zustand';
import { Conversation, Message } from '../types';

interface ConversationState {
  conversations: Conversation[];
  currentConversationId: string | null;
  isLoaded: boolean;

  // 初始化和加载
  loadFromDatabase: () => Promise<void>;

  // 对话操作
  createConversation: () => Promise<string>;
  deleteConversation: (id: string) => Promise<void>;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => Promise<void>;
  updateConversationMessages: (id: string, messages: Conversation['messages']) => Promise<void>;
  updateConversationTitle: (id: string, title: string) => Promise<void>;
  generateTitle: (id: string, firstMessage: string) => Promise<void>;

  // 消息操作
  addMessage: (conversationId: string, message: Message) => Promise<void>;
  addMessages: (conversationId: string, messages: Message[]) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  isLoaded: false,

  /**
   * 从数据库加载所有对话
   */
  loadFromDatabase: async () => {
    try {
      const result = await window.electronAPI.conversation.getAll();
      if (result.success && result.data) {
        // 获取每个对话的完整数据（包含消息）
        const conversationsWithData = await Promise.all(
          result.data.map(async (conv: any) => {
            const detailResult = await window.electronAPI.conversation.getById(conv.id);
            if (detailResult.success && detailResult.data) {
              return {
                id: detailResult.data.id,
                title: detailResult.data.title,
                messages: detailResult.data.messages || [],
                createdAt: detailResult.data.createdAt,
                updatedAt: detailResult.data.updatedAt,
              };
            }
            return {
              id: conv.id,
              title: conv.title,
              messages: [],
              createdAt: conv.createdAt,
              updatedAt: conv.updatedAt,
            };
          })
        );

        set({
          conversations: conversationsWithData,
          isLoaded: true,
        });
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      console.error('Failed to load conversations from database:', error);
      set({ isLoaded: true });
    }
  },

  /**
   * 创建新对话
   */
  createConversation: async () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      // 保存到数据库
      const result = await window.electronAPI.conversation.create({
        id: newConversation.id,
        title: newConversation.title,
        messages: [],
      });

      if (result.success) {
        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          currentConversationId: newConversation.id,
        }));
        return newConversation.id;
      } else {
        throw new Error(result.error || 'Failed to create conversation');
      }
    } catch (error) {
      console.error('Failed to create conversation:', error);
      // 即使数据库保存失败，也在内存中创建
      set((state) => ({
        conversations: [newConversation, ...state.conversations],
        currentConversationId: newConversation.id,
      }));
      return newConversation.id;
    }
  },

  /**
   * 删除对话
   */
  deleteConversation: async (id) => {
    try {
      await window.electronAPI.conversation.delete(id);
    } catch (error) {
      console.error('Failed to delete conversation from database:', error);
    }

    set((state) => ({
      conversations: state.conversations.filter(c => c.id !== id),
      currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
    }));
  },

  /**
   * 选择对话
   */
  selectConversation: (id) => set({ currentConversationId: id }),

  /**
   * 重命名对话
   */
  renameConversation: async (id, title) => {
    try {
      await window.electronAPI.conversation.updateTitle(id, title);
    } catch (error) {
      console.error('Failed to update conversation title in database:', error);
    }

    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      ),
    }));
  },

  /**
   * 更新对话消息
   */
  updateConversationMessages: async (id, messages) => {
    try {
      // 批量添加新消息到数据库
      const existingConv = get().conversations.find(c => c.id === id);
      if (existingConv) {
        const newMessages = messages.slice(existingConv.messages.length);
        if (newMessages.length > 0) {
          await window.electronAPI.message.addBatch(
            newMessages.map(msg => ({
              ...msg,
              conversationId: id,
            }))
          );
        } else {
          // 如果消息数量减少，可能需要其他处理逻辑
          await window.electronAPI.conversation.touch(id);
        }
      }
    } catch (error) {
      console.error('Failed to update messages in database:', error);
    }

    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === id ? { ...c, messages, updatedAt: Date.now() } : c
      ),
    }));
  },

  /**
   * 更新对话标题
   */
  updateConversationTitle: async (id, title) => {
    try {
      await window.electronAPI.conversation.updateTitle(id, title);
    } catch (error) {
      console.error('Failed to update conversation title in database:', error);
    }

    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      ),
    }));
  },

  /**
   * 生成对话标题
   */
  generateTitle: async (id, firstMessage) => {
    // 直接截取用户输入作为标题，避免额外的 API 请求
    const trimmed = firstMessage.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const title = trimmed.length > 15 ? trimmed.substring(0, 15) + '...' : trimmed;

    try {
      await window.electronAPI.conversation.updateTitle(id, title);
    } catch (error) {
      console.error('Failed to update conversation title in database:', error);
    }

    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      ),
    }));
  },

  /**
   * 添加单条消息
   */
  addMessage: async (conversationId, message) => {
    try {
      await window.electronAPI.message.add({
        ...message,
        conversationId,
      });
    } catch (error) {
      console.error('Failed to add message to database:', error);
    }

    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, message], updatedAt: Date.now() }
          : c
      ),
    }));
  },

  /**
   * 批量添加消息
   */
  addMessages: async (conversationId, messages) => {
    if (messages.length === 0) return;

    try {
      await window.electronAPI.message.addBatch(
        messages.map(msg => ({
          ...msg,
          conversationId,
        }))
      );
    } catch (error) {
      console.error('Failed to add messages to database:', error);
    }

    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === conversationId
          ? { ...c, messages: [...c.messages, ...messages], updatedAt: Date.now() }
          : c
      ),
    }));
  },
}));
