import { contextBridge, ipcRenderer } from 'electron';

// 工作区类型定义
interface WorkspaceInfo {
  id: string;
  name: string;
  description?: string;
  path: string;
  createdAt: number;
  lastAccessed: number;
  agentProfile?: string;
  version?: string;
}

interface CreateWorkspaceOptions {
  name: string;
  path?: string;
  description?: string;
  agentProfile?: string;
  copyDefaultConfig?: boolean;
}

interface SwitchWorkspaceOptions {
  migrateData?: boolean;
  validateStructure?: boolean;
}

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
    // 新工作区管理 API
    listWorkspaces: () => ipcRenderer.invoke('workspace:listWorkspaces') as Promise<{
      success: boolean;
      workspaces?: WorkspaceInfo[];
      error?: string;
    }>,
    createWorkspace: (options: CreateWorkspaceOptions) => ipcRenderer.invoke('workspace:createWorkspace', options) as Promise<{
      success: boolean;
      workspace?: WorkspaceInfo;
      error?: string;
    }>,
    switchWorkspace: (workspaceId: string, options?: SwitchWorkspaceOptions) => ipcRenderer.invoke('workspace:switchWorkspace', workspaceId, options) as Promise<{
      success: boolean;
      workspace?: WorkspaceInfo;
      error?: string;
    }>,
    getCurrentWorkspace: () => ipcRenderer.invoke('workspace:getCurrentWorkspace') as Promise<{
      success: boolean;
      workspace?: WorkspaceInfo | null;
      error?: string;
    }>,
    deleteWorkspace: (workspaceId: string, deleteFiles?: boolean) => ipcRenderer.invoke('workspace:deleteWorkspace', workspaceId, deleteFiles) as Promise<{
      success: boolean;
      error?: string;
    }>,
    updateWorkspace: (workspaceId: string, updates: Partial<Pick<WorkspaceInfo, 'name' | 'description' | 'agentProfile'>>) =>
      ipcRenderer.invoke('workspace:updateWorkspace', workspaceId, updates) as Promise<{
        success: boolean;
        workspace?: WorkspaceInfo;
        error?: string;
      }>,
    validateWorkspace: (workspacePath: string) => ipcRenderer.invoke('workspace:validateWorkspace', workspacePath) as Promise<{
      success: boolean;
      validation?: {
        isValid: boolean;
        errors: string[];
        warnings: string[];
        missingFiles: string[];
      };
      error?: string;
    }>,
  },
  // 凭证 API
  credentials: {
    getApiKey: () => ipcRenderer.invoke('credentials:getApiKey') as Promise<string | null>,
    setApiKey: (apiKey: string) => ipcRenderer.invoke('credentials:setApiKey', apiKey) as Promise<{ success: boolean }>,
    getApiKeyByService: (service: string) => ipcRenderer.invoke('credentials:getApiKeyByService', service) as Promise<string | null>,
    setApiKeyByService: (service: string, apiKey: string) => ipcRenderer.invoke('credentials:setApiKeyByService', service, apiKey) as Promise<{ success: boolean }>,
    deleteApiKey: (service: string) => ipcRenderer.invoke('credentials:deleteApiKey', service) as Promise<{ success: boolean }>,
    listServices: () => ipcRenderer.invoke('credentials:listServices') as Promise<string[]>,
    clearAll: () => ipcRenderer.invoke('credentials:clearAll') as Promise<{ success: boolean }>,
    migrateFromOldConfig: (oldApiKey?: string) => ipcRenderer.invoke('credentials:migrateFromOldConfig', oldApiKey) as Promise<{ success: boolean }>,
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
  reports: {
    listTemplates: (category?: string) => ipcRenderer.invoke('reports:listTemplates', category),
    getTemplate: (templateId: string) => ipcRenderer.invoke('reports:getTemplate', templateId),
    generate: (options: any) => ipcRenderer.invoke('reports:generate', options),
    export: (options: any) => ipcRenderer.invoke('reports:export', options),
    saveToHistory: (report: any) => ipcRenderer.invoke('reports:saveToHistory', report),
    getHistory: () => ipcRenderer.invoke('reports:getHistory'),
    deleteFromHistory: (reportId: string) => ipcRenderer.invoke('reports:deleteFromHistory', reportId),
  },
  workflows: {
    list: () => ipcRenderer.invoke('workflows:list'),
    get: (id: string) => ipcRenderer.invoke('workflows:get', id),
    save: (workflow: any) => ipcRenderer.invoke('workflows:save', workflow),
    delete: (id: string) => ipcRenderer.invoke('workflows:delete', id),
    setEnabled: (id: string, enabled: boolean) => ipcRenderer.invoke('workflows:setEnabled', id, enabled),
    execute: (id: string, variables?: any) => ipcRenderer.invoke('workflows:execute', id, variables),
    cancel: (executionId: string) => ipcRenderer.invoke('workflows:cancel', executionId),
    getExecution: (executionId: string) => ipcRenderer.invoke('workflows:getExecution', executionId),
    getExecutions: (workflowId?: string) => ipcRenderer.invoke('workflows:getExecutions', workflowId),
    getTemplates: () => ipcRenderer.invoke('workflows:getTemplates'),
    installTemplate: (templateId: string) => ipcRenderer.invoke('workflows:installTemplate', templateId),
  },
  analytics: {
    analyze: (timeRange: string) => ipcRenderer.invoke('analytics:analyze', timeRange),
    chartData: (timeRange: string) => ipcRenderer.invoke('analytics:chartData', timeRange),
    summary: (timeRange: string) => ipcRenderer.invoke('analytics:summary', timeRange),
    report: (timeRange: string) => ipcRenderer.invoke('analytics:report', timeRange),
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
  onTokenUsage: (callback: (usage: any) => void) => {
    const listener = (_event: any, usage: any) => callback(usage);
    ipcRenderer.on('chat:token_usage', listener);
    return () => ipcRenderer.removeListener('chat:token_usage', listener);
  },
  removeChatChunkListener: () => {
    ipcRenderer.removeAllListeners('chat:chunk');
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
