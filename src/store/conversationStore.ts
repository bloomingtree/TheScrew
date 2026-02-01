import { create } from 'zustand';
import { Conversation } from '../types';

interface ConversationState {
  conversations: Conversation[];
  currentConversationId: string | null;

  createConversation: () => string;
  deleteConversation: (id: string) => void;
  selectConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  updateConversationMessages: (id: string, messages: Conversation['messages']) => void;
  updateConversationTitle: (id: string, title: string) => void;
  generateTitle: (id: string, firstMessage: string) => Promise<void>;
}

export const useConversationStore = create<ConversationState>((set) => ({
  conversations: [],
  currentConversationId: null,

  createConversation: () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: '新对话',
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    set((state) => ({
      conversations: [newConversation, ...state.conversations],
      currentConversationId: newConversation.id,
    }));

    return newConversation.id;
  },

  deleteConversation: (id) => set((state) => ({
    conversations: state.conversations.filter(c => c.id !== id),
    currentConversationId: state.currentConversationId === id ? null : state.currentConversationId,
  })),

  selectConversation: (id) => set({ currentConversationId: id }),

  renameConversation: (id, title) => set((state) => ({
    conversations: state.conversations.map(c => 
      c.id === id ? { ...c, title, updatedAt: Date.now() } : c
    ),
  })),

  updateConversationMessages: (id, messages) => set((state) => ({
    conversations: state.conversations.map(c =>
      c.id === id ? { ...c, messages, updatedAt: Date.now() } : c
    ),
  })),

  updateConversationTitle: (id, title) => set((state) => ({
    conversations: state.conversations.map(c =>
      c.id === id ? { ...c, title, updatedAt: Date.now() } : c
    ),
  })),

  generateTitle: async (id, firstMessage) => {
    // 直接截取用户输入作为标题，避免额外的 API 请求
    // 移除换行符和多余空格，取前 15 个字符
    const trimmed = firstMessage.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    const title = trimmed.length > 15 ? trimmed.substring(0, 15) + '...' : trimmed;

    set((state) => ({
      conversations: state.conversations.map(c =>
        c.id === id ? { ...c, title, updatedAt: Date.now() } : c
      ),
    }));
  },
}));
