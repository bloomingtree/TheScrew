interface ElectronAPI {
  chat: {
    stream: (messages: any[]) => Promise<any>;
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
  };
  file: {
    selectImage: () => Promise<{ canceled: boolean; data?: string }>;
    saveFile: (content: string, filename: string) => Promise<void>;
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
