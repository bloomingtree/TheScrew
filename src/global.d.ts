interface ElectronAPI {
  chat: {
    stream: (messages: any[], conversationId?: string) => Promise<any>;
    stop: () => Promise<void>;
    generateTitle: (message: string) => Promise<{ success: boolean; title?: string; error?: string }>;
    // Agent 管理
    setAgent: (conversationId: string, agentName: string) => Promise<{ success: boolean; agentName?: string }>;
    getAgent: (conversationId: string) => Promise<{ success: boolean; agentName?: string | null }>;
    getAllAgents: () => Promise<{ success: boolean; agents?: Array<{ name: string; description: string; model?: string }> }>;
    getAgentSystemPrompt: (conversationId: string) => Promise<{ success: boolean; prompt?: string }>;
    getAgentModel: (conversationId: string) => Promise<{ success: boolean; model?: string }>;
  };
  workspace: {
    select: () => Promise<{ path: string | null; error?: string }>;
    getPath: () => Promise<{ path: string | null }>;
    setPath: (path: string) => Promise<{ success: boolean; path: string }>;
    listFiles: () => Promise<{ success: boolean; files?: Array<{ name: string; path: string; type: string; size?: number }>; error?: string }>;
  };
  tools: {
    getToolSetsOverview: (conversationId: string) => Promise<{
      success: boolean;
      toolSets?: Array<{
        name: string;
        description: string;
        capabilities: string[];
        keywords: string[];
        estimatedTokens: number;
      }>;
      error?: string;
    }>;
    activateToolSet: (conversationId: string, toolSetName: string) => Promise<{
      success: boolean;
      tools?: any[];
      message?: string;
      error?: string;
    }>;
    estimateActiveTokens: (conversationId: string) => Promise<{
      success: boolean;
      tokens?: number;
      error?: string;
    }>;
    getActiveGroups: (conversationId: string) => Promise<{
      success: boolean;
      groups?: string[];
      error?: string;
    }>;
  };
  config: {
    get: () => Promise<any>;
    set: (config: any) => Promise<void>;
    validate: (config: any) => Promise<any>;
    getModelInfo: (config: any) => Promise<{ maxTokens?: number; modelInfo?: any }>;
  };
  file: {
    selectImage: () => Promise<{ canceled: boolean; data?: string }>;
    saveFile: (content: string, filename: string) => Promise<void>;
  };
  template: {
    getTemplates: () => Promise<{ success: boolean; templates?: any[]; error?: string }>;
    getTemplateDetail: (id: string) => Promise<{ success: boolean; template?: any; error?: string }>;
    addTemplate: (template: any) => Promise<{ success: boolean; template?: any; error?: string }>;
    updateTemplate: (id: string, updates: any) => Promise<{ success: boolean; error?: string }>;
    deleteTemplate: (id: string) => Promise<{ success: boolean; error?: string }>;
    useTemplate: (params: any) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    convertDocument: (params: any) => Promise<{ success: boolean; filePath?: string; error?: string }>;
    useAssistant: (params: any) => Promise<{ success: boolean; result?: any; error?: string }>;
    applyPrompt: (id: string, params: any) => Promise<{ success: boolean; prompt?: string; error?: string }>;
    getAssistant: (id: string) => Promise<{ success: boolean; assistant?: any; error?: string }>;
    getByCategory: (category: string) => Promise<{ success: boolean; templates?: any[]; error?: string }>;
    getByType: (type: string) => Promise<{ success: boolean; templates?: any[]; error?: string }>;
  };
  word: {
    preview: (filepath: string) => Promise<{
      filepath: string;
      structure: {
        paragraphs: Array<{ index: number; text: string; length: number }>;
        tables: Array<{
          index: number;
          rows: Array<{
            index: number;
            cells: Array<{ text: string }>;
          }>;
        }>;
      };
      html: string;
      metadata: {
        path: string;
        size?: number;
        modified?: string;
      };
    }>;
    parseDocument: (filepath: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    edit: (filepath: string, location: any, newContent: string) => Promise<{ success: boolean }>;
  };
  conversation: {
    getAll: () => Promise<{ success: boolean; data?: any[]; error?: string }>;
    getById: (id: string) => Promise<{ success: boolean; data?: any; error?: string }>;
    create: (conversation: any) => Promise<{ success: boolean; data?: any; error?: string }>;
    updateTitle: (id: string, title: string) => Promise<{ success: boolean; error?: string }>;
    touch: (id: string) => Promise<{ success: boolean; error?: string }>;
    delete: (id: string) => Promise<{ success: boolean; error?: string }>;
    search: (query: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    getStats: () => Promise<{ success: boolean; data?: any; error?: string }>;
    export: () => Promise<{ success: boolean; data?: string; error?: string }>;
    clear: () => Promise<{ success: boolean; error?: string }>;
  };
  message: {
    getByConversationId: (conversationId: string) => Promise<{ success: boolean; data?: any[]; error?: string }>;
    add: (message: any) => Promise<{ success: boolean; data?: any; error?: string }>;
    addBatch: (messages: any[]) => Promise<{ success: boolean; error?: string }>;
    delete: (id: string) => Promise<{ success: boolean; error?: string }>;
  };
  getAppVersion: () => Promise<string>;
  onChatChunk: (callback: (chunk: string) => void) => () => void;
  onToolCalls: (callback: (toolCalls: any[]) => void) => () => void;
  onToolResults: (callback: (results: any[]) => void) => () => void;
  onToolStart: (callback: (data: any) => void) => () => void;
  onToolComplete: (callback: (data: any) => void) => () => void;
  removeChatChunkListener: () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
