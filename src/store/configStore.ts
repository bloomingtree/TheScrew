import { create } from 'zustand';
import { Config } from '../types';

interface ConfigState extends Config {
  isConfigOpen: boolean;
  setConfig: (config: Partial<Config>) => void;
  setConfigOpen: (isOpen: boolean) => void;
  resetConfig: () => void;
}

const defaultConfig: Config = {
  apiKey: '',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-3.5-turbo',
  temperature: 0.7,
  maxTokens: 2000,
};

export const useConfigStore = create<ConfigState>((set) => ({
  ...defaultConfig,
  isConfigOpen: false,

  setConfig: (config) => set((state) => ({ ...state, ...config })),

  setConfigOpen: (isOpen) => set({ isConfigOpen: isOpen }),

  resetConfig: () => set(defaultConfig),
}));
