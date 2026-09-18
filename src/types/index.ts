export type TabbitColorName =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'purple'
  | 'pink'
  | 'cyan'
  | 'grey';

export interface TabbitGroup {
  id: string;
  chromeGroupId?: number;
  title: string;
  emoji: string;
  colorName: TabbitColorName;
  colorHex: string;
  collapsed: boolean;
  tabIds: number[];
}

export interface TabItem {
  id: number;
  title: string;
  url: string;
  domain: string;
  description?: string;
  favIconUrl?: string;
  active?: boolean;
  screenshot?: string;
}

export interface LLMConfig {
  provider: 'deepseek' | 'qwen' | 'custom';
  apiKey: string;
  baseUrl: string;
  model: string;
  autoCollapse: boolean;
  autoOrganizeEnabled: boolean;
  autoOrganizeThreshold: number;
}

export interface ClassificationResult {
  appendToExisting: Array<{ tabId: number; groupId: string }>;
  newGroups: Array<{
    title: string;
    emoji: string;
    colorName: TabbitColorName;
    tabIds: number[];
  }>;
}
