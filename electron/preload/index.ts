import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  chat: {
    stream: (messages: any[]) => ipcRenderer.invoke('chat:stream', messages),
    stop: () => ipcRenderer.invoke('chat:stop'),
  },
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    set: (config: any) => ipcRenderer.invoke('config:set', config),
    validate: (config: any) => ipcRenderer.invoke('config:validate', config),
  },
  file: {
    selectImage: () => ipcRenderer.invoke('file:select-image'),
    saveFile: (content: string, filename: string) => ipcRenderer.invoke('file:save', content, filename),
  },
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  onChatChunk: (callback: (chunk: string) => void) => {
    const listener = (_event: any, chunk: string) => callback(chunk);
    ipcRenderer.on('chat:chunk', listener);
    return () => ipcRenderer.removeListener('chat:chunk', listener);
  },
  removeChatChunkListener: () => {
    ipcRenderer.removeAllListeners('chat:chunk');
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
