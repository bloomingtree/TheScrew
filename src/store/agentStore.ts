import { create } from 'zustand';

export interface Agent {
  name: string;
  description: string;
  model?: string;
}

interface AgentState {
  agents: Agent[];
  currentAgent: string | null;
  isLoaded: boolean;

  // 加载所有 Agents
  loadAgents: () => Promise<void>;

  // 设置当前对话的 Agent
  setAgent: (conversationId: string, agentName: string) => Promise<void>;

  // 获取当前对话的 Agent
  getAgent: (conversationId: string) => Promise<string | null>;

  // 获取所有 Agents
  getAllAgents: () => Promise<Agent[]>;

  // 设置本地当前 Agent（用于 UI 显示）
  setCurrentAgent: (agentName: string | null) => void;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  currentAgent: 'default', // 默认使用 default agent
  isLoaded: false,

  /**
   * 从后端加载所有可用的 Agents
   */
  loadAgents: async () => {
    try {
      const result = await (window as any).electronAPI.chat.getAllAgents();
      if (result.success && result.agents) {
        set({
          agents: result.agents,
          isLoaded: true,
        });
        console.log('Agents loaded:', result.agents);
      } else {
        set({ isLoaded: true });
      }
    } catch (error) {
      console.error('Failed to load agents:', error);
      set({ isLoaded: true });
    }
  },

  /**
   * 设置对话的 Agent
   */
  setAgent: async (conversationId: string, agentName: string) => {
    try {
      const result = await (window as any).electronAPI.chat.setAgent(conversationId, agentName);
      if (result.success) {
        set({ currentAgent: agentName });
        console.log(`Agent "${agentName}" set for conversation "${conversationId}"`);
      }
    } catch (error) {
      console.error('Failed to set agent:', error);
    }
  },

  /**
   * 获取对话的当前 Agent
   */
  getAgent: async (conversationId: string) => {
    try {
      const result = await (window as any).electronAPI.chat.getAgent(conversationId);
      if (result.success && result.agentName) {
        set({ currentAgent: result.agentName });
        return result.agentName;
      }
      return null;
    } catch (error) {
      console.error('Failed to get agent:', error);
      return null;
    }
  },

  /**
   * 获取所有可用的 Agents
   */
  getAllAgents: async () => {
    const state = get();
    if (!state.isLoaded) {
      await state.loadAgents();
    }
    return state.agents;
  },

  /**
   * 设置本地当前 Agent（用于 UI 显示）
   */
  setCurrentAgent: (agentName: string | null) => {
    set({ currentAgent: agentName });
  },
}));
