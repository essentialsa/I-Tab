import {
  getConfig,
  saveScreenshot,
  getStoredGroups,
  saveStoredGroups,
  getScreenshots,
} from '../services/storage';
import { scanWindowTabs } from '../services/tabScanner';
import { classifyTabs } from '../services/llm';
import {
  applyClassification,
  ungroupAllNativeGroups,
  mergeAndCleanGroups,
} from '../services/groupManager';

let isOrganizing = false;

async function setBadge(text: string, color: string, autoClearMs = 0) {
  try {
    await chrome.action.setBadgeText({ text });
    await chrome.action.setBadgeBackgroundColor({ color });
    if (autoClearMs > 0) {
      setTimeout(async () => {
        const current = await chrome.action.getBadgeText({});
        if (current === text) {
          await chrome.action.setBadgeText({ text: '' });
        }
      }, autoClearMs);
    }
  } catch (err) {
    console.warn('Failed to set badge:', err);
  }
}

export async function handleOrganize(targetWindowId?: number) {
  if (isOrganizing) {
    return;
  }

  isOrganizing = true;
  await setBadge('AI...', '#2563EB');

  try {
    const config = await getConfig();
    if (!config.apiKey) {
      await setBadge('!', '#EF4444', 3000);
      chrome.runtime.openOptionsPage();
      return;
    }

    const { existingGroups, unassignedTabs, activeTabId, windowId } =
      await scanWindowTabs(targetWindowId);

    // 立即解散当前窗口顶栏原生分组
    await ungroupAllNativeGroups(windowId);

    if (unassignedTabs.length === 0) {
      await setBadge('✓', '#10B981', 1500);
      return;
    }

    const classification = await classifyTabs(
      config,
      unassignedTabs,
      existingGroups
    );

    await applyClassification(classification, config, activeTabId, windowId);
    await setBadge('✓', '#10B981', 2000);

    if (windowId) {
      captureWindowTabs(windowId);
    }

    // 若当前窗口中已有打开的预览主页标签，则同步更新其展示
    const stored = await getStoredGroups();
    if (stored.length > 0 && windowId) {
      try {
        const tabs = await chrome.tabs.query({ windowId });
        const existing = tabs.find(
          (t) => t.url && t.url.startsWith(chrome.runtime.getURL('src/preview/index.html'))
        );
        if (existing && existing.id) {
          const targetUrl = chrome.runtime.getURL(`src/preview/index.html?groupId=${stored[0].id}`);
          await chrome.tabs.update(existing.id, { url: targetUrl });
        }
      } catch {}
    }
  } catch (err: any) {
    console.error('Tabbit organization error:', err);
    await setBadge('!', '#EF4444', 3500);
  } finally {
    isOrganizing = false;
  }
}

// 1. 插件安装/更新或重载时，解散任何原生分组并为所有窗口展开侧边栏
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await ungroupAllNativeGroups();
    const wins = await chrome.windows.getAll();
    for (const win of wins) {
      if (win.id) {
        chrome.sidePanel.open({ windowId: win.id }).catch(() => {});
      }
    }
  } catch {}
});

// 2. 点击工具栏扩展图标时：确保侧边栏已展开，同时触发 AI 一键智能整理
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.windowId) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
  handleOrganize(tab.windowId);
});

// 3. 快捷键触发一键无感整理 (Cmd+Shift+G / Alt+Shift+G)
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'organize-tabs') {
    const lastFocused = await chrome.windows.getLastFocused().catch(() => null);
    handleOrganize(lastFocused?.id);
  }
});

// 4. 消息监听器：接收来自侧边栏等组件的触发请求
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TRIGGER_ORGANIZE') {
    handleOrganize(message.windowId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
  if (message.type === 'CAPTURE_WINDOW_TABS' && message.windowId) {
    captureWindowTabs(message.windowId);
    sendResponse({ success: true });
    return true;
  }
});

// 5. 标签超限自动整理机制
let autoOrganizeDebounceTimer: any = null;
let lastAutoOrganizeTime = 0;

function scheduleAutoOrganize(windowId: number) {
  if (autoOrganizeDebounceTimer) {
    clearTimeout(autoOrganizeDebounceTimer);
  }

  autoOrganizeDebounceTimer = setTimeout(async () => {
    // 6 秒冷却时间，避免高频打扰
    const now = Date.now();
    if (now - lastAutoOrganizeTime < 6000) {
      // 顺延重试
      setTimeout(() => scheduleAutoOrganize(windowId), 6000 - (now - lastAutoOrganizeTime));
      return;
    }

    try {
      const config = await getConfig();
      if (!config.autoOrganizeEnabled || !config.apiKey) {
        return;
      }

      const threshold = config.autoOrganizeThreshold ?? 6;
      const allTabs = await chrome.tabs.query({ windowId, pinned: false });

      // 仅统计真正的 Web 标签，杜绝空白页与扩展页充数导致误触发
      const eligibleTabs = allTabs.filter(
        (t) => t.url && (t.url.startsWith('http://') || t.url.startsWith('https://'))
      );

      // 当有效网页总数达到阈值，且存在未被分组的有效标签时触发
      if (eligibleTabs.length >= threshold) {
        const { unassignedTabs } = await scanWindowTabs(windowId);
        if (unassignedTabs.length > 0) {
          console.log(
            `[I-Tab] 窗口有效网页数 (${eligibleTabs.length}) 达到阈值 (${threshold})，触发后台静默自动整理...`
          );
          lastAutoOrganizeTime = Date.now();
          await handleOrganize(windowId);
        }
      }
    } catch (err) {
      console.warn('[I-Tab] 自动整理探测异常:', err);
    }
  }, 2000); // 2 秒防抖，等待网页加载稳定
}

// 关键修复：绝不在 onCreated（新标签刚创建为空白页）时触发整理！
// 仅在真实 Web 页面彻底加载完成 (status === complete) 后触发自动整理检查
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (
    changeInfo.status === 'complete' &&
    tab.windowId &&
    tab.url &&
    (tab.url.startsWith('http://') || tab.url.startsWith('https://'))
  ) {
    scheduleAutoOrganize(tab.windowId);
  }
});

// 6. 快速批量捕获当前窗口尚未截屏的标签页真实网页图像
async function captureWindowTabs(windowId: number) {
  try {
    const tabs = await chrome.tabs.query({ windowId });
    const originalActive = tabs.find((t) => t.active);
    const screenshots = await getScreenshots();

    const toCapture = tabs.filter(
      (t) => t.id && t.url && t.url.startsWith('http') && !screenshots[t.url]
    );

    for (const t of toCapture) {
      try {
        await chrome.tabs.update(t.id!, { active: true });
        await new Promise((r) => setTimeout(r, 160));
        const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
          format: 'jpeg',
          quality: 60,
        });
        if (dataUrl && t.url) {
          await saveScreenshot(t.url, dataUrl);
          console.log('[I-Tab] Successfully captured screenshot for:', t.url);
        }
      } catch (err) {
        console.warn('[I-Tab] captureVisibleTab failed for tab:', t.url, err);
      }
    }

    if (originalActive && originalActive.id) {
      await chrome.tabs.update(originalActive.id, { active: true });
    }
  } catch (err) {
    console.warn('[I-Tab] captureWindowTabs error:', err);
  }
}

// 7. 标签页关闭时，以全局存活标签集合为准清理死标签，绝不误伤其它窗口
chrome.tabs.onRemoved.addListener(async () => {
  try {
    const allTabs = await chrome.tabs.query({});
    const liveIds = new Set(allTabs.map((t) => t.id).filter(Boolean));
    const groups = await getStoredGroups();
    const updated = mergeAndCleanGroups(groups, liveIds);

    if (JSON.stringify(updated) !== JSON.stringify(groups)) {
      await saveStoredGroups(updated);
      chrome.runtime.sendMessage({ type: 'TABBIT_GROUPS_UPDATED' }).catch(() => {});
    }
  } catch {}
});

// 8. 自动快速捕获当前激活标签页的缩略图快照
async function captureTabSafe(tabId: number, windowId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && tab.url.startsWith('http') && tab.active) {
      const dataUrl = await chrome.tabs.captureVisibleTab(windowId, {
        format: 'jpeg',
        quality: 60,
      });
      if (dataUrl) {
        await saveScreenshot(tab.url, dataUrl);
      }
    }
  } catch (err) {
    console.warn('[I-Tab] captureTabSafe error:', err);
  }
}

let captureTimer: any = null;
chrome.tabs.onActivated.addListener((activeInfo) => {
  if (captureTimer) clearTimeout(captureTimer);
  captureTimer = setTimeout(() => {
    captureTabSafe(activeInfo.tabId, activeInfo.windowId);
  }, 300);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active && tab.windowId) {
    captureTabSafe(tabId, tab.windowId);
  }
});
