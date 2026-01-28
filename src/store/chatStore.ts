import { create } from 'zustand';
import { Message } from '../types';

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  currentConversationId: string | null;

  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  deleteMessage: (index: number) => void;
  setStreaming: (isStreaming: boolean) => void;
  clearMessages: () => void;
  setConversationId: (id: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  currentConversationId: null,

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),

  updateLastMessage: (content) => set((state) => {
    if (state.messages.length === 0) return state;

    const updated = [...state.messages];
    updated[updated.length - 1] = {
      ...updated[updated.length - 1],
      content,
    };

    return { messages: updated };
  }),

  deleteMessage: (index) => set((state) => ({
    messages: state.messages.filter((_, i) => i !== index),
  })),

  setStreaming: (isStreaming) => set({ isStreaming }),

  clearMessages: () => set({ messages: [] }),

  setConversationId: (id) => set({ currentConversationId: id }),
}));
