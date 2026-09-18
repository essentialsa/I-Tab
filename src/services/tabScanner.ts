import { TabItem, TabbitGroup } from '../types';
import { getStoredGroups, saveStoredGroups } from './storage';
import { mergeAndCleanGroups } from './groupManager';

export interface ScanResult {
  windowId: number;
  existingGroups: TabbitGroup[];
  unassignedTabs: TabItem[];
  activeTabId?: number;
}

export function extractDomain(urlStr: string): string {
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return 'other';
  }
}

/**
 * 严格判断标签页是否符合 AI 整理与分组收纳标准
 * 坚决剔除空白页、浏览器内部管理页、扩展自身页面及非 Web 页面
 */
export function isEligibleForClassification(tab: chrome.tabs.Tab): boolean {
  if (!tab.id || !tab.url || tab.pinned) {
    return false;
  }

  const url = tab.url.trim().toLowerCase();

  // 1. 过滤任何非 Web 协议（原生空白页、系统设置、扩展页面等）
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('edge://') ||
    url.startsWith('about:') ||
    url.startsWith('devtools://') ||
    url.startsWith('chrome-search://') ||
    url.startsWith('file://') ||
    url.startsWith('view-source:')
  ) {
    return false;
  }

  // 2. 仅允许标准 http 或 https 互联网页面
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return false;
  }

  // 3. 过滤标题为空白页或无内容的新标签页
  const title = (tab.title || '').trim().toLowerCase();
  if (
    title === 'new tab' ||
    title === '新标签页' ||
    title === 'about:blank' ||
    url.includes('newtab')
  ) {
    return false;
  }

  return true;
}

export async function scanWindowTabs(targetWindowId?: number): Promise<ScanResult> {
  let windowId = targetWindowId;
  if (!windowId || windowId === chrome.windows.WINDOW_ID_NONE) {
    try {
      const currentWindow = await chrome.windows.getCurrent();
      windowId = currentWindow?.id;
    } catch {}
  }
  if (!windowId || windowId === chrome.windows.WINDOW_ID_NONE) {
    const lastFocused = await chrome.windows.getLastFocused().catch(() => null);
    windowId = lastFocused?.id || chrome.windows.WINDOW_ID_CURRENT;
  }

  const allTabs = await chrome.tabs.query({ windowId });

  const activeTab = allTabs.find((t) => t.active);
  const activeTabId = activeTab?.id;

  // 读取已保存的 Tabbit 分组
  let existingGroups = await getStoredGroups();

  // 关键修复：以全局所有存活标签集合为准清理死标签，绝不能仅查单窗口而误删其它窗口的分组标签！
  const allBrowserTabs = await chrome.tabs.query({});
  const globalLiveTabIdSet = new Set(allBrowserTabs.map((t) => t.id).filter(Boolean));

  // 自动合并同名分组并清洗无效 tabId
  existingGroups = mergeAndCleanGroups(existingGroups, globalLiveTabIdSet);
  await saveStoredGroups(existingGroups);

  // 获取已被分配到分组中的 tabId 集合
  const groupedTabIdSet = new Set<number>();
  for (const group of existingGroups) {
    for (const tid of group.tabIds) {
      groupedTabIdSet.add(tid);
    }
  }

  // 筛选出未分组、未固定且真正符合 Web 规范的标签页
  const unassignedTabs: TabItem[] = [];
  for (const tab of allTabs) {
    if (!isEligibleForClassification(tab)) {
      continue;
    }

    // 如果未加入任何 Tabbit 组
    if (tab.id && !groupedTabIdSet.has(tab.id)) {
      const domain = extractDomain(tab.url!);
      const item: TabItem = {
        id: tab.id,
        title: tab.title || domain,
        url: tab.url!,
        domain,
        favIconUrl: tab.favIconUrl,
        active: tab.active,
      };

      unassignedTabs.push(item);
    }
  }

  return {
    windowId,
    existingGroups,
    unassignedTabs,
    activeTabId,
  };
}
