import { ClassificationResult, LLMConfig, TabbitGroup } from '../types';
import {
  COLOR_PALETTE,
  getStoredGroups,
  saveStoredGroups,
} from './storage';

export interface ApplyResult {
  assignedCount: number;
  newGroupCount: number;
}

function generateId(): string {
  return 'grp_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
}

/**
 * 规范化分组名称（去除首尾多余空白、标点与包裹符号）
 */
export function normalizeGroupTitle(title: string): string {
  if (!title) return '';
  return title.trim().replace(/^["'“”‘’【\[（(]+|["'“”‘’】\]）)]+$/g, '').trim();
}

/**
 * 深度合并同名分组并清洗已失效的 tabId（自愈机制）
 */
export function mergeAndCleanGroups(
  groups: TabbitGroup[],
  liveTabIdSet?: Set<number | undefined>
): TabbitGroup[] {
  const mergedMap = new Map<string, TabbitGroup>();
  const seenTabIds = new Set<number>();

  for (const group of groups) {
    const cleanTitle = normalizeGroupTitle(group.title) || '常用网页';
    const normKey = cleanTitle.toLowerCase();

    // 过滤已关闭/失效的标签
    let validTabIds = liveTabIdSet
      ? group.tabIds.filter((id) => liveTabIdSet.has(id))
      : group.tabIds;

    // 确保同一个 tabId 跨分组不重复出现（优先保留先出现的分组）
    validTabIds = validTabIds.filter((id) => !seenTabIds.has(id));
    validTabIds.forEach((id) => seenTabIds.add(id));

    if (mergedMap.has(normKey)) {
      // 发现同名分组，自动合并其 tabIds，绝不产生重复同名组！
      const existing = mergedMap.get(normKey)!;
      for (const tid of validTabIds) {
        if (!existing.tabIds.includes(tid)) {
          existing.tabIds.push(tid);
        }
      }
    } else {
      mergedMap.set(normKey, {
        ...group,
        title: cleanTitle,
        tabIds: validTabIds,
      });
    }
  }

  // 移除合并后为空的分组
  return Array.from(mergedMap.values()).filter((g) => g.tabIds.length > 0);
}

/**
 * 解散 Chrome 原生标签栏中的所有分组，确保顶部标签栏纯净、标准、无多余气泡
 */
export async function ungroupAllNativeGroups(windowId?: number): Promise<void> {
  try {
    const tabs = windowId
      ? await chrome.tabs.query({ windowId })
      : await chrome.tabs.query({});
    const groupedTabIds = tabs
      .filter((t) => t.id && t.groupId !== undefined && t.groupId > 0)
      .map((t) => t.id!);
    if (groupedTabIds.length > 0) {
      await chrome.tabs.ungroup(groupedTabIds);
    }
  } catch (err) {
    console.warn('Failed to ungroup native tabs:', err);
  }
}

export async function applyClassification(
  classification: ClassificationResult,
  config: LLMConfig,
  activeTabId?: number,
  windowId?: number
): Promise<ApplyResult> {
  let assignedCount = 0;
  let newGroupCount = 0;

  // 1. 彻底解散 Chrome 顶栏原生的所有分组
  await ungroupAllNativeGroups(windowId);

  // 2. 获取当前全局所有存活标签，防止多窗口状态污染
  const allBrowserTabs = await chrome.tabs.query({});
  const globalLiveTabIds = new Set(allBrowserTabs.map((t) => t.id).filter(Boolean));

  const currentGroups = await getStoredGroups();
  // 先执行一次自愈清理与同名合并
  const cleanedGroups = mergeAndCleanGroups(currentGroups, globalLiveTabIds);

  const groupMap = new Map<string, TabbitGroup>();
  const assignedTabIds = new Set<number>();

  for (const g of cleanedGroups) {
    groupMap.set(g.id, { ...g, chromeGroupId: undefined, tabIds: [...g.tabIds] });
    for (const tid of g.tabIds) {
      assignedTabIds.add(tid);
    }
  }

  // 3. 增量吸附已有虚拟分组（带有效性与防重校验）
  for (const item of classification.appendToExisting) {
    const tid = Number(item.tabId);
    if (!globalLiveTabIds.has(tid) || assignedTabIds.has(tid)) {
      continue;
    }

    if (groupMap.has(item.groupId)) {
      const targetGroup = groupMap.get(item.groupId)!;
      targetGroup.tabIds.push(tid);
      assignedTabIds.add(tid);
      assignedCount += 1;
    }
  }

  // 4. 建立新虚拟分组（带同名智能合并，绝不创建同名重复组）
  for (const newG of classification.newGroups) {
    if (!newG.tabIds || newG.tabIds.length === 0) {
      continue;
    }

    const cleanTitle = normalizeGroupTitle(newG.title) || '常用网页';
    const freshTabIds = newG.tabIds
      .map(Number)
      .filter((id) => globalLiveTabIds.has(id) && !assignedTabIds.has(id));

    if (freshTabIds.length === 0) {
      continue;
    }

    // 检查是否已有同名分组（大小写不敏感）
    const existingGroup = Array.from(groupMap.values()).find(
      (g) => g.title.trim().toLowerCase() === cleanTitle.toLowerCase()
    );

    if (existingGroup) {
      // 存在同名分组：直接增量合并进入已有分组
      for (const tid of freshTabIds) {
        existingGroup.tabIds.push(tid);
        assignedTabIds.add(tid);
        assignedCount += 1;
      }
    } else {
      // 不存在同名组：新建分组
      const groupId = generateId();
      const group: TabbitGroup = {
        id: groupId,
        chromeGroupId: undefined,
        title: cleanTitle,
        emoji: newG.emoji || '🗂️',
        colorName: newG.colorName || 'blue',
        colorHex: COLOR_PALETTE[newG.colorName] || '#0284c7',
        collapsed: false,
        tabIds: freshTabIds,
      };

      freshTabIds.forEach((id) => assignedTabIds.add(id));
      groupMap.set(groupId, group);
      assignedCount += freshTabIds.length;
      newGroupCount += 1;
    }
  }

  // 再次运行合并清理，确保结构完全紧凑合法
  const updatedGroups = mergeAndCleanGroups(Array.from(groupMap.values()), globalLiveTabIds);

  // 5. 侧边栏内部智能折叠状态同步（仅影响插件侧栏，不触碰 Chrome 顶栏）
  if (config.autoCollapse) {
    for (const group of updatedGroups) {
      const isCurrentActive = activeTabId ? group.tabIds.includes(activeTabId) : false;
      group.collapsed = !isCurrentActive;
    }
  }

  // 6. 保存到插件本地持久化存储
  await saveStoredGroups(updatedGroups);

  // 7. 通知前端即时重绘侧边栏与画廊主页
  try {
    chrome.runtime.sendMessage({ type: 'TABBIT_GROUPS_UPDATED' }).catch(() => {});
  } catch {}

  return { assignedCount, newGroupCount };
}
