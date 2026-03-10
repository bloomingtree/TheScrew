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
  },
  workspace: {
    select: () => ipcRenderer.invoke('workspace:select'),
    getPath: () => ipcRenderer.invoke('workspace:get_path'),
    setPath: (path: string) => ipcRenderer.invoke('workspace:set_path', path),
    listFiles: () => ipcRenderer.invoke('workspace:list_files'),
    listDirectory: (dirPath: string) => ipcRenderer.invoke('workspace:listDirectory', dirPath),
    // 文件监听 API
    startWatching: () => ipcRenderer.invoke('workspace:startWatching'),
    stopWatching: () => ipcRenderer.invoke('workspace:stopWatching'),
    onFileChanged: (callback: (data: { event: string; path: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('workspace:fileChanged', listener);
      return () => ipcRenderer.removeListener('workspace:fileChanged', listener);
    },
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
    // 模型配置 API
    modelConfig: {
      getAll: () => ipcRenderer.invoke('modelConfig:getAll') as Promise<{
        configs: any[];
        activeConfigId: string;
      }>,
      getActive: () => ipcRenderer.invoke('modelConfig:getActive') as Promise<any | null>,
      add: (config: any) => ipcRenderer.invoke('modelConfig:add', config) as Promise<any>,
      update: (id: string, config: any) => ipcRenderer.invoke('modelConfig:update', id, config) as Promise<any | null>,
      delete: (id: string) => ipcRenderer.invoke('modelConfig:delete', id) as Promise<{ success: boolean }>,
      setActive: (id: string) => ipcRenderer.invoke('modelConfig:setActive', id) as Promise<any | null>,
      duplicate: (id: string) => ipcRenderer.invoke('modelConfig:duplicate', id) as Promise<any | null>,
      import: (configs: any[]) => ipcRenderer.invoke('modelConfig:import', configs) as Promise<any[]>,
      export: () => ipcRenderer.invoke('modelConfig:export') as Promise<any[]>,
      sync: (modelConfigs: any) => ipcRenderer.invoke('modelConfig:sync', modelConfigs) as Promise<{ success: boolean }>,
      migrateFromLocalStorage: (data: string) => ipcRenderer.invoke('modelConfig:migrateFromLocalStorage', data) as Promise<{ success: boolean }>,
    },
  },
  file: {
    selectImage: () => ipcRenderer.invoke('file:select-image') as Promise<{ canceled: boolean; data?: string }>,
    saveFile: (content: string, filename: string) => ipcRenderer.invoke('file:save', content, filename),
  },
  // Attachment API
  attachment: {
    selectFiles: (options: { multiple?: boolean; messageId?: string }) =>
      ipcRenderer.invoke('attachment:selectFiles', options) as Promise<{
        canceled: boolean;
        attachments?: any[];
        error?: string;
      }>,
    listByMessage: (messageId: string) =>
      ipcRenderer.invoke('attachment:listByMessage', messageId) as Promise<{
        success: boolean;
        attachments?: any[];
        error?: string;
      }>,
    delete: (attachmentId: string) =>
      ipcRenderer.invoke('attachment:delete', attachmentId) as Promise<{
        success: boolean;
        error?: string;
      }>,
    getContent: (attachmentId: string) =>
      ipcRenderer.invoke('attachment:getContent', attachmentId) as Promise<{
        success: boolean;
        attachment?: any;
        error?: string;
      }>,
    updateMessageId: (attachmentId: string, messageId: string) =>
      ipcRenderer.invoke('attachment:updateMessageId', attachmentId, messageId) as Promise<{
        success: boolean;
        error?: string;
      }>,
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
  // 文件预览 API
  filePreview: {
    preview: (filepath: string) => ipcRenderer.invoke('file:preview', filepath) as Promise<{
      success: boolean;
      data?: any;
      error?: string;
    }>,
    getType: (filepath: string) => ipcRenderer.invoke('file:getType', filepath) as Promise<{
      success: boolean;
      type?: string;
      error?: string;
    }>,
    canPreview: (filepath: string) => ipcRenderer.invoke('file:canPreview', filepath) as Promise<{
      success: boolean;
      canPreview?: boolean;
      type?: string;
      error?: string;
    }>,
    saveText: (filepath: string, content: string) => ipcRenderer.invoke('file:saveText', filepath, content) as Promise<{
      success: boolean;
      error?: string;
    }>,
  },
  // Word 文档 API
  word: {
    preview: (filepath: string) => ipcRenderer.invoke('word:preview', filepath) as Promise<{
      success: boolean;
      data?: any;
      error?: string;
    }>,
    edit: (filepath: string, location: any, newContent: string) =>
      ipcRenderer.invoke('word:edit', filepath, location, newContent) as Promise<{
        success: boolean;
        error?: string;
      }>,
  },
  // Skills API
  skills: {
    listSimple: () => ipcRenderer.invoke('skills:listSimple') as Promise<{
      success: boolean;
      skills?: any[];
      error?: string;
    }>,
    loadSimple: (name: string) => ipcRenderer.invoke('skills:loadSimple', name) as Promise<{
      success: boolean;
      skill?: any;
      error?: string;
    }>,
    buildSummary: (activeSkills?: string[]) => ipcRenderer.invoke('skills:buildSummary', activeSkills) as Promise<{
      success: boolean;
      summary?: string;
      error?: string;
    }>,
    reloadWorkspace: () => ipcRenderer.invoke('skills:reloadWorkspace') as Promise<{
      success: boolean;
      count?: number;
      error?: string;
    }>,
    // Export/Import
    export: (skillName: string) => ipcRenderer.invoke('skills:export', skillName) as Promise<{
      success: boolean;
      zipData?: Uint8Array;
      suggestedFileName?: string;
      error?: string;
    }>,
    import: (filePath: string) => ipcRenderer.invoke('skills:import', filePath) as Promise<{
      success: boolean;
      skill?: any;
      error?: string;
    }>,
    importFromBuffer: (buffer: Uint8Array) => ipcRenderer.invoke('skills:importFromBuffer', buffer) as Promise<{
      success: boolean;
      skill?: any;
      error?: string;
    }>,
    importFromContent: (content: string) => ipcRenderer.invoke('skills:importFromContent', content) as Promise<{
      success: boolean;
      skill?: any;
      error?: string;
    }>,
    delete: (skillName: string) => ipcRenderer.invoke('skills:delete', skillName) as Promise<{
      success: boolean;
      error?: string;
    }>,
    setVisibility: (skillName: string, visibility: 'public' | 'organization' | 'private') =>
      ipcRenderer.invoke('skills:setVisibility', skillName, visibility) as Promise<{
        success: boolean;
        error?: string;
      }>,
    getShareable: () => ipcRenderer.invoke('skills:getShareable') as Promise<{
      success: boolean;
      skills?: any[];
      error?: string;
    }>,
  },
  // File Editor API
  fileEditor: {
    readFile: (filepath: string) => ipcRenderer.invoke('fileEditor:readFile', filepath) as Promise<{
      success: boolean;
      content?: string;
      error?: string;
    }>,
    saveFile: (filepath: string, content: string) => ipcRenderer.invoke('fileEditor:saveFile', filepath, content) as Promise<{
      success: boolean;
      error?: string;
    }>,
    createFile: (filepath: string, content?: string) => ipcRenderer.invoke('fileEditor:createFile', filepath, content) as Promise<{
      success: boolean;
      error?: string;
    }>,
    createDirectory: (dirpath: string) => ipcRenderer.invoke('fileEditor:createDirectory', dirpath) as Promise<{
      success: boolean;
      error?: string;
    }>,
    deleteFile: (filepath: string) => ipcRenderer.invoke('fileEditor:deleteFile', filepath) as Promise<{
      success: boolean;
      error?: string;
    }>,
    renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('fileEditor:renameFile', oldPath, newPath) as Promise<{
      success: boolean;
      error?: string;
    }>,
    copyFile: (sourcePath: string, targetPath: string) => ipcRenderer.invoke('fileEditor:copyFile', sourcePath, targetPath) as Promise<{
      success: boolean;
      error?: string;
    }>,
    moveFile: (sourcePath: string, targetPath: string) => ipcRenderer.invoke('fileEditor:moveFile', sourcePath, targetPath) as Promise<{
      success: boolean;
      error?: string;
    }>,
    listDirectory: (dirpath: string) => ipcRenderer.invoke('fileEditor:listDirectory', dirpath) as Promise<{
      success: boolean;
      entries?: Array<{
        name: string;
        path: string;
        type: 'file' | 'directory';
        size?: number;
        modified?: number;
      }>;
      error?: string;
    }>,
    watchFiles: (dirpath: string) => ipcRenderer.invoke('fileEditor:watchFiles', dirpath) as Promise<{
      success: boolean;
      error?: string;
    }>,
    unwatchFiles: () => ipcRenderer.invoke('fileEditor:unwatchFiles') as Promise<{
      success: boolean;
      error?: string;
    }>,
    onFileChanged: (callback: (data: { event: string; path: string }) => void) => {
      const listener = (_event: any, data: any) => callback(data);
      ipcRenderer.on('fileEditor:fileChanged', listener);
      return () => ipcRenderer.removeListener('fileEditor:fileChanged', listener);
    },
    openWithSystem: (filepath: string) => ipcRenderer.invoke('fileEditor:openWithSystem', filepath) as Promise<{
      success: boolean;
      error?: string;
    }>,
  },
  // P2P API
  p2p: {
    startDiscovery: () => ipcRenderer.invoke('p2p:startDiscovery') as Promise<{
      success: boolean;
      error?: string;
    }>,
    stopDiscovery: () => ipcRenderer.invoke('p2p:stopDiscovery') as Promise<{
      success: boolean;
      error?: string;
    }>,
    getPeers: () => ipcRenderer.invoke('p2p:getPeers') as Promise<{
      success: boolean;
      peers?: Array<{
        id: string;
        name: string;
        avatar?: string;
        ip: string;
        port: number;
        lastSeen: number;
        skillsCount: number;
      }>;
      error?: string;
    }>,
    getPeerSkills: (peerIp: string) => ipcRenderer.invoke('p2p:getPeerSkills', peerIp) as Promise<{
      success: boolean;
      skills?: any[];
      error?: string;
    }>,
    downloadSkill: (peerIp: string, skillName: string) => ipcRenderer.invoke('p2p:downloadSkill', peerIp, skillName) as Promise<{
      success: boolean;
      skill?: any;
      error?: string;
    }>,
    setDeviceName: (name: string) => ipcRenderer.invoke('p2p:setDeviceName', name) as Promise<{
      success: boolean;
      error?: string;
    }>,
    setDeviceAvatar: (avatar: string) => ipcRenderer.invoke('p2p:setDeviceAvatar', avatar) as Promise<{
      success: boolean;
      error?: string;
    }>,
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
