import { create } from 'zustand';
import { ToolCall, ToolResult, ToolExecution } from '../types';

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
  toolCallWritingMap: Map<string, {
    toolCallId: string;
    name: string;
    status: 'writing' | 'written';
    argLength?: number;
    timestamp: number;
  }>;
  tokenUsage: TokenUsage;

  // 消息操作（保持顺序）
  addMessage: (message: any) => void;
  updateLastMessage: (content: string) => void;
  updateLastMessageThinking: (thinking: string) => void;
  updateLastMessageToolCalls: (toolCalls: ToolCall[]) => void;
  setMessages: (messages: any[]) => void;
  clearMessages: () => void;

  setStreaming: (isStreaming: boolean) => void;
  setConversationId: (id: string) => void;
  setToolCalls: (toolCalls: ToolCall[]) => void;
  setToolResults: (toolResults: ToolResult[]) => void;
  startToolExecution: (execution: ToolExecution) => void;
  completeToolExecution: (toolCallId: string, success: boolean, duration: number) => void;
  setToolCallWriting: (data: {
    toolCallId: string;
    name: string;
    status: 'writing' | 'written';
    argLength?: number;
    timestamp: number;
  }) => void;
  clearToolCallWriting: (toolCallId: string) => void;
  setTokenUsage: (usage: Partial<TokenUsage>) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isStreaming: false,
  currentConversationId: null,
  toolCalls: [],
  toolResults: [],
  toolExecutions: new Map(),
  toolCallWritingMap: new Map(),
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
      // 同值守卫：内容未变化时不产生新数组，避免无效重渲染
      if (updated[lastIdx].content === content) return state;
      updated[lastIdx] = {
        ...updated[lastIdx],
        content,
      };
    }

    return { messages: updated };
  }),

  updateLastMessageThinking: (thinking) => set((state) => {
    if (state.messages.length === 0) return state;

    const updated = [...state.messages];
    const lastIdx = updated.length - 1;

    if (updated[lastIdx].role === 'assistant') {
      // 同值守卫：思考内容未变化时不产生新数组
      if (updated[lastIdx].thinkingContent === thinking) return state;
      updated[lastIdx] = {
        ...updated[lastIdx],
        thinkingContent: thinking,
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

  setToolCallWriting: (data) => set((state) => {
    const map = new Map(state.toolCallWritingMap);
    map.set(data.toolCallId, data);
    return { toolCallWritingMap: map };
  }),

  clearToolCallWriting: (toolCallId) => set((state) => {
    const map = new Map(state.toolCallWritingMap);
    map.delete(toolCallId);
    return { toolCallWritingMap: map };
  }),

  setTokenUsage: (usage) => set((state) => ({
    tokenUsage: { ...state.tokenUsage, ...usage },
  })),
}));
