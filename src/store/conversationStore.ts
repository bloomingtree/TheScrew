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
}));
