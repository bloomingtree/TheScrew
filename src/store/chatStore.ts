import { create } from 'zustand';
import { ToolCall, ToolResult, ToolExecution } from '../types';

interface Task {
  id: string;
  content: string;
  completed: boolean;
  createdAt: number;
}

interface TokenUsage {
  current: number;
  max: number;
  percentage: number;
  compressedCount: number;
}

interface ChatState {
  messages: any[];            // 按顺序存储的消息（user/assistant/tool）
  isStreaming: boolean;
  currentConversationId: string | null;
  toolCalls: ToolCall[];
  toolResults: ToolResult[];
  toolExecutions: Map<string, ToolExecution>;
  tasks: Task[];
  tokenUsage: TokenUsage;

  // 消息操作（保持顺序）
  addMessage: (message: any) => void;
  updateLastMessage: (content: string) => void;
  updateLastMessageToolCalls: (toolCalls: ToolCall[]) => void;
  setMessages: (messages: any[]) => void;
  clearMessages: () => void;

  setStreaming: (isStreaming: boolean) => void;
  setConversationId: (id: string) => void;
  setToolCalls: (toolCalls: ToolCall[]) => void;
  setToolResults: (toolResults: ToolResult[]) => void;
  startToolExecution: (execution: ToolExecution) => void;
  completeToolExecution: (toolCallId: string, success: boolean, duration: number) => void;
  addTask: (content: string) => void;
  toggleTask: (id: string) => void;
  removeTask: (id: string) => void;
  setTokenUsage: (usage: Partial<TokenUsage>) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  currentConversationId: null,
  toolCalls: [],
  toolResults: [],
  toolExecutions: new Map(),
  tasks: [],
  tokenUsage: {
    current: 0,
    max: 128000,
    percentage: 0,
    compressedCount: 0,
  },

  addMessage: (message) => set((state) => ({
    messages: [...state.messages, message],
  })),

  updateLastMessage: (content) => set((state) => {
    if (state.messages.length === 0) return state;

    const updated = [...state.messages];
    const lastIdx = updated.length - 1;

    // 只更新最后一条 assistant 消息的内容
    if (updated[lastIdx].role === 'assistant') {
      updated[lastIdx] = {
        ...updated[lastIdx],
        content,
      };
    }

    return { messages: updated };
  }),

  updateLastMessageToolCalls: (newToolCalls) => set((state) => {
    if (state.messages.length === 0) return state;

    const updated = [...state.messages];
    // 从后往前找最后一条 assistant 消息
    let lastAssistantIndex = updated.length - 1;
    while (lastAssistantIndex >= 0 && updated[lastAssistantIndex].role !== 'assistant') {
      lastAssistantIndex--;
    }

    if (lastAssistantIndex >= 0) {
      const existingToolCalls = updated[lastAssistantIndex].tool_calls || [];
      const existingIds = new Set(existingToolCalls.map((tc: any) => tc.id));
      const uniqueNewCalls = newToolCalls.filter(tc => !existingIds.has(tc.id));

      const normalizedNewCalls = uniqueNewCalls.map(tc => ({
        id: tc.id,
        type: tc.type,
        function: tc.function,
      }));

      updated[lastAssistantIndex] = {
        ...updated[lastAssistantIndex],
        tool_calls: [...existingToolCalls, ...normalizedNewCalls],
      };
    }

    return { messages: updated };
  }),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ messages: [] }),

  setStreaming: (isStreaming) => set({ isStreaming }),

  setConversationId: (id) => set({ currentConversationId: id }),

  setToolCalls: (toolCalls) => set({ toolCalls }),

  setToolResults: (newResults) => set((state) => {
    const existingIds = new Set(state.toolResults.map(r => r.toolCallId));
    const uniqueNewResults = newResults.filter(r => !existingIds.has(r.toolCallId));

    return {
      toolResults: [...state.toolResults, ...uniqueNewResults],
    };
  }),

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

  setTokenUsage: (usage) => set((state) => ({
    tokenUsage: { ...state.tokenUsage, ...usage },
  })),
}));
