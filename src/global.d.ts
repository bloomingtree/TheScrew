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
  memory: {
    getLongTerm: () => Promise<{ success: boolean; content?: string; error?: string }>;
    addLongTerm: (content: string, tags?: string[]) => Promise<{ success: boolean; error?: string }>;
    getTodayNote: () => Promise<{ success: boolean; content?: string; error?: string }>;
    addTodayNote: (content: string) => Promise<{ success: boolean; error?: string }>;
    getDailyNote: (dateString: string) => Promise<{ success: boolean; content?: string; error?: string }>;
    addDailyNote: (content: string, dateString: string) => Promise<{ success: boolean; error?: string }>;
    getRecentNotes: (days?: number) => Promise<{ success: boolean; notes?: Record<string, string>; error?: string }>;
    search: (query: string, options?: {
      types?: Array<'long_term' | 'daily_note'>;
      maxDays?: number;
      maxResults?: number;
    }) => Promise<{ success: boolean; results?: any[]; error?: string }>;
    buildContext: () => Promise<{ success: boolean; context?: string; error?: string }>;
    delete: (type: 'long_term' | 'daily_note', dateString?: string) => Promise<{ success: boolean; error?: string }>;
    getStats: () => Promise<{ success: boolean; stats?: any; error?: string }>;
    clearAll: () => Promise<{ success: boolean; error?: string }>;
  };
  subagents: {
    spawn: (
      task: string,
      label: string,
      parentSessionId: string,
      llmConfig: {
        baseUrl: string;
        apiKey: string;
        model: string;
        temperature?: number;
        maxTokens?: number;
      },
      options?: {
        timeout?: number;
        maxIterations?: number;
      }
    ) => Promise<{ success: boolean; taskId?: string; error?: string }>;
    getStatus: (taskId: string) => Promise<{ success: boolean; task?: any; error?: string }>;
    getResult: (taskId: string) => Promise<{ success: boolean; result?: any; error?: string }>;
    getBySession: (parentSessionId: string) => Promise<{ success: boolean; tasks?: any[]; error?: string }>;
    getRunning: () => Promise<{ success: boolean; tasks?: any[]; error?: string }>;
    cancel: (taskId: string) => Promise<{ success: boolean; error?: string }>;
    waitFor: (taskId: string, timeout?: number) => Promise<{ success: boolean; result?: any; error?: string }>;
    retry: (taskId: string) => Promise<{ success: boolean; newTaskId?: string; error?: string }>;
    cleanup: (maxAge?: number) => Promise<{ success: boolean; cleaned?: number; error?: string }>;
    getStats: () => Promise<{ success: boolean; stats?: any; error?: string }>;
    clearAll: () => Promise<{ success: boolean; error?: string }>;
  };
  skills: {
    initialize: () => Promise<{ success: boolean; error?: string }>;
    getNames: () => Promise<{ success: boolean; names?: string[]; error?: string }>;
    getMeta: (name: string) => Promise<{ success: boolean; meta?: any; error?: string }>;
    getAlways: () => Promise<{ success: boolean; skills?: any[]; error?: string }>;
    getOnDemand: () => Promise<{ success: boolean; skills?: any[]; error?: string }>;
    getSummary: () => Promise<{ success: boolean; summary?: string; error?: string }>;
    load: (name: string) => Promise<{ success: boolean; skill?: any; error?: string }>;
    detect: (message: string) => Promise<{ success: boolean; required?: string[]; error?: string }>;
    buildPrompt: () => Promise<{ success: boolean; prompt?: string; error?: string }>;
    estimateTokens: (additionalSkills?: string[]) => Promise<{ success: boolean; tokens?: number; error?: string }>;
    has: (name: string) => Promise<{ success: boolean; exists?: boolean; error?: string }>;
    reload: (name: string) => Promise<{ success: boolean; error?: string }>;
    getStats: () => Promise<{ success: boolean; stats?: any; error?: string }>;
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
