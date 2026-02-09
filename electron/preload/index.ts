import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  chat: {
    stream: (messages: any[], conversationId?: string) => ipcRenderer.invoke('chat:stream', messages, conversationId),
    stop: () => ipcRenderer.invoke('chat:stop'),
    generateTitle: (message: string) => ipcRenderer.invoke('chat:generateTitle', message) as Promise<{ success: boolean; title?: string; error?: string }>,
    setAgent: (conversationId: string, agentName: string) => ipcRenderer.invoke('chat:setAgent', conversationId, agentName),
    getAgent: (conversationId: string) => ipcRenderer.invoke('chat:getAgent', conversationId),
    getAllAgents: () => ipcRenderer.invoke('chat:getAllAgents'),
    getAgentSystemPrompt: (conversationId: string) => ipcRenderer.invoke('chat:getAgentSystemPrompt', conversationId),
    getAgentModel: (conversationId: string) => ipcRenderer.invoke('chat:getAgentModel', conversationId),
  },
  workspace: {
    select: () => ipcRenderer.invoke('workspace:select'),
    getPath: () => ipcRenderer.invoke('workspace:get_path'),
    setPath: (path: string) => ipcRenderer.invoke('workspace:set_path', path),
    listFiles: () => ipcRenderer.invoke('workspace:list_files'),
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (config: any) => ipcRenderer.invoke('config:set', config),
    validate: (config: any) => ipcRenderer.invoke('config:validate', config),
    getModelInfo: (config: any) => ipcRenderer.invoke('config:getModelInfo', config),
  },
  file: {
    selectImage: () => ipcRenderer.invoke('file:select-image') as Promise<{ canceled: boolean; data?: string }>,
    saveFile: (content: string, filename: string) => ipcRenderer.invoke('file:save', content, filename),
  },
  pyodide: {
    listFiles: (workspacePath: string) => ipcRenderer.invoke('pyodide:list-files', workspacePath) as Promise<{
      success: boolean;
      files?: Array<{
        name: string;
        path: string;
        type: 'file' | 'directory';
        size?: number;
        modified?: Date;
      }>;
      error?: string;
    }>,
    readFile: (workspacePath: string, relativePath: string) =>
      ipcRenderer.invoke('pyodide:read-file', workspacePath, relativePath) as Promise<{
        success: boolean;
        content?: string;
        path?: string;
        encoding?: 'utf-8' | 'base64';
        error?: string;
      }>,
    writeFile: (workspacePath: string, relativePath: string, content: string, encoding?: string) =>
      ipcRenderer.invoke('pyodide:write-file', workspacePath, relativePath, content, encoding) as Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>,
    deleteFile: (workspacePath: string, relativePath: string) =>
      ipcRenderer.invoke('pyodide:delete-file', workspacePath, relativePath) as Promise<{
        success: boolean;
        path?: string;
        error?: string;
      }>,
  },
  conversation: {
    getAll: () => ipcRenderer.invoke('conversation:getAll'),
    getById: (id: string) => ipcRenderer.invoke('conversation:getById', id),
    create: (conversation: any) => ipcRenderer.invoke('conversation:create', conversation),
    updateTitle: (id: string, title: string) => ipcRenderer.invoke('conversation:updateTitle', id, title),
    touch: (id: string) => ipcRenderer.invoke('conversation:touch', id),
    delete: (id: string) => ipcRenderer.invoke('conversation:delete', id),
    search: (query: string) => ipcRenderer.invoke('conversation:search', query),
    getStats: () => ipcRenderer.invoke('conversation:getStats'),
    export: () => ipcRenderer.invoke('conversation:export'),
    clear: () => ipcRenderer.invoke('conversation:clear'),
  },
  message: {
    getByConversationId: (conversationId: string) => ipcRenderer.invoke('message:getByConversationId', conversationId),
    add: (message: any) => ipcRenderer.invoke('message:add', message),
    addBatch: (messages: any[]) => ipcRenderer.invoke('message:addBatch', messages),
    delete: (id: string) => ipcRenderer.invoke('message:delete', id),
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onChatChunk: (callback: (chunk: string) => void) => {
    const listener = (_event: any, chunk: string) => callback(chunk);
    ipcRenderer.on('chat:chunk', listener);
    return () => ipcRenderer.removeListener('chat:chunk', listener);
  },
  onToolCalls: (callback: (toolCalls: any[]) => void) => {
    const listener = (_event: any, toolCalls: any[]) => callback(toolCalls);
    ipcRenderer.on('chat:tool_calls', listener);
    return () => ipcRenderer.removeListener('chat:tool_calls', listener);
  },
  onToolResults: (callback: (results: any[]) => void) => {
    const listener = (_event: any, results: any[]) => callback(results);
    ipcRenderer.on('chat:tool_results', listener);
    return () => ipcRenderer.removeListener('chat:tool_results', listener);
  },
  onToolStart: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('chat:tool_start', listener);
    return () => ipcRenderer.removeListener('chat:tool_start', listener);
  },
  onToolComplete: (callback: (data: any) => void) => {
    const listener = (_event: any, data: any) => callback(data);
    ipcRenderer.on('chat:tool_complete', listener);
    return () => ipcRenderer.removeListener('chat:tool_complete', listener);
  },
  removeChatChunkListener: () => {
    ipcRenderer.removeAllListeners('chat:chunk');
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
