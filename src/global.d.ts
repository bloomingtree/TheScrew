interface ElectronAPI {
  chat: {
    stream: (messages: any[], conversationId?: string) => Promise<any>;
    stop: () => Promise<void>;
    generateTitle: (message: string) => Promise<{ success: boolean; title?: string; error?: string }>;
  };
  workspace: {
    select: () => Promise<{ path: string | null; error?: string }>;
    getPath: () => Promise<{ path: string | null }>;
    setPath: (path: string) => Promise<{ success: boolean; path: string }>;
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
