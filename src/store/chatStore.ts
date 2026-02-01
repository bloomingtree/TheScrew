import { create } from 'zustand';
import { Message, ToolCall, ToolResult, ToolExecution } from '../types';

interface Task {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
}

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  currentConversationId: string | null;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  toolExecutions: Map<string, ToolExecution>;
  tasks: Task[];

  addMessage: (message: Message) => void;
  updateLastMessage: (content: string) => void;
  deleteMessage: (index: number) => void;
  setStreaming: (isStreaming: boolean) => void;
  clearMessages: () => void;
  setConversationId: (id: string) => void;
  setToolCalls: (toolCalls: ToolCall[]) => void;
  setToolResults: (toolResults: ToolResult[]) => void;
  startToolExecution: (execution: ToolExecution) => void;
  completeToolExecution: (toolCallId: string, success: boolean, duration: number) => void;
  addTask: (content: string) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  currentConversationId: null,
  toolCalls: [],
  toolResults: [],
  toolExecutions: new Map(),
  tasks: [],

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

  setToolCalls: (toolCalls) => set({ toolCalls }),

  setToolResults: (toolResults) => set({ toolResults }),

  startToolExecution: (execution) => set((state) => {
    const newExecutions = new Map(state.toolExecutions);
    newExecutions.set(execution.toolCallId, execution);
    return { toolExecutions: newExecutions };
  }),

  completeToolExecution: (toolCallId, success, duration) => set((state) => {
    const newExecutions = new Map(state.toolExecutions);
    const execution = newExecutions.get(toolCallId);
    if (execution) {
      newExecutions.set(toolCallId, {
        ...execution,
        endTime: Date.now(),
        duration,
        success,
      });
    }
    return { toolExecutions: newExecutions };
  }),

  addTask: (content) => set((state) => ({
    tasks: [
      ...state.tasks,
      {
        id: Date.now().toString(),
        content,
        completed: false,
        createdAt: Date.now(),
      },
    ],
  })),

  toggleTask: (id) => set((state) => ({
    tasks: state.tasks.map((task) =>
      task.id === id ? { ...task, completed: !task.completed } : task
    ),
  })),

  removeTask: (id) => set((state) => ({
    tasks: state.tasks.filter((task) => task.id === id),
  })),
}));
