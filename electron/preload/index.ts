import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  chat: {
    stream: (messages: any[], conversationId?: string) => ipcRenderer.invoke('chat:stream', messages, conversationId),
    stop: () => ipcRenderer.invoke('chat:stop'),
    generateTitle: (message: string) => ipcRenderer.invoke('chat:generateTitle', message) as Promise<{ success: boolean; title?: string; error?: string }>,
  },
  workspace: {
    select: () => ipcRenderer.invoke('workspace:select'),
    getPath: () => ipcRenderer.invoke('workspace:get_path'),
    setPath: (path: string) => ipcRenderer.invoke('workspace:set_path', path),
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
  template: {
    getTemplates: () => ipcRenderer.invoke('template:getTemplates'),
    getTemplateDetail: (id: string) => ipcRenderer.invoke('template:getTemplateDetail', id),
    addTemplate: (template: any) => ipcRenderer.invoke('template:addTemplate', template),
    updateTemplate: (id: string, updates: any) => ipcRenderer.invoke('template:updateTemplate', id, updates),
    deleteTemplate: (id: string) => ipcRenderer.invoke('template:deleteTemplate', id),
    useTemplate: (params: any) => ipcRenderer.invoke('template:useTemplate', params),
    convertDocument: (params: any) => ipcRenderer.invoke('template:convertDocument', params),
    useAssistant: (params: any) => ipcRenderer.invoke('template:useAssistant', params),
    applyPrompt: (id: string, params: any) => ipcRenderer.invoke('template:applyPrompt', id, params),
    getAssistant: (id: string) => ipcRenderer.invoke('template:getAssistant', id),
    getByCategory: (category: string) => ipcRenderer.invoke('template:getByCategory', category),
    getByType: (type: string) => ipcRenderer.invoke('template:getByType', type),
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
