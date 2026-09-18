import { LLMConfig, TabbitGroup, TabbitColorName } from '../types';

export const COLOR_PALETTE: Record<TabbitColorName, string> = {
  blue: '#4A90D9',
  green: '#34C759',
  orange: '#FF9500',
  purple: '#AF52DE',
  pink: '#FF2D55',
  red: '#FF3B30',
  yellow: '#FFCC00',
  cyan: '#5AC8FA',
  grey: '#8E8E93',
};

export const DEFAULT_CONFIG: LLMConfig = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat',
  autoCollapse: true,
  autoOrganizeEnabled: true,
  autoOrganizeThreshold: 6,
};

export const PROVIDER_PRESETS: Record<
  'deepseek' | 'qwen',
  { baseUrl: string; model: string }
> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
  },
  qwen: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
  },
};

export async function getConfig(): Promise<LLMConfig> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['tabbit_config'], (result) => {
      if (result.tabbit_config) {
        resolve({ ...DEFAULT_CONFIG, ...result.tabbit_config });
      } else {
        resolve(DEFAULT_CONFIG);
      }
    });
  });
}

export async function saveConfig(config: LLMConfig): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ tabbit_config: config }, () => {
      resolve();
    });
  });
}

export async function getStoredGroups(): Promise<TabbitGroup[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tabbit_groups'], (result) => {
      resolve(result.tabbit_groups || []);
    });
  });
}

export async function saveStoredGroups(groups: TabbitGroup[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set({ tabbit_groups: groups }, () => {
      resolve();
    });
  });
}

export async function getScreenshots(): Promise<Record<string, string>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['tabbit_screenshots'], (result) => {
      resolve(result.tabbit_screenshots || {});
    });
  });
}

export async function saveScreenshot(urlKey: string, dataUrl: string): Promise<void> {
  const current = await getScreenshots();
  current[urlKey] = dataUrl;
  return new Promise((resolve) => {
    chrome.storage.local.set({ tabbit_screenshots: current }, () => {
      resolve();
    });
  });
}
