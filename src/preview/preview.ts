import { TabbitGroup } from '../types';
import {
  getStoredGroups,
  saveStoredGroups,
  getScreenshots,
} from '../services/storage';
import { isEligibleForClassification } from '../services/tabScanner';
import { mergeAndCleanGroups } from '../services/groupManager';
import { getFaviconUrl, attachFaviconFallback } from '../utils/favicon';

let allTabs: chrome.tabs.Tab[] = [];
let tabbitGroups: TabbitGroup[] = [];
let screenshots: Record<string, string> = {};
let currentGroupId: string | null = null;

function extractDomain(urlStr?: string): string {
  if (!urlStr) return '';
  try {
    const url = new URL(urlStr);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getLayerIconSvg(color: string, size = 16): string {
  return `<svg class="pill-layer-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  </svg>`;
}

async function refreshData() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const windowId = currentWindow.id!;

    allTabs = await chrome.tabs.query({ windowId });
    // 全局多窗口安全清洗
    const allBrowserTabs = await chrome.tabs.query({});
    const globalLiveIds = new Set(allBrowserTabs.map((t) => t.id).filter(Boolean));

    const rawGroups = await getStoredGroups();
    tabbitGroups = mergeAndCleanGroups(rawGroups, globalLiveIds);
    screenshots = await getScreenshots();

    if (JSON.stringify(rawGroups) !== JSON.stringify(tabbitGroups)) {
      await saveStoredGroups(tabbitGroups);
    }

    // 获取 URL 传参指定的 groupId
    const params = new URLSearchParams(window.location.search);
    const paramGroupId = params.get('groupId');

    if (paramGroupId && (paramGroupId === 'ungrouped' || tabbitGroups.some((g) => g.id === paramGroupId))) {
      currentGroupId = paramGroupId;
    } else if (!currentGroupId || !tabbitGroups.some((g) => g.id === currentGroupId)) {
      currentGroupId = tabbitGroups.length > 0 ? tabbitGroups[0].id : null;
    }

    renderNavbar();
    renderGroupHome();

    // 触发后台为未捕获网页抓取真实快照
    const missingScreenshots = allTabs.filter(
      (t) => t.url && t.url.startsWith('http') && !screenshots[t.url]
    );
    if (missingScreenshots.length > 0) {
      chrome.runtime.sendMessage({ type: 'CAPTURE_WINDOW_TABS', windowId }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to refresh group-home data:', err);
  }
}

// 渲染顶部全景导航胶囊
function renderNavbar() {
  const pillsRoot = document.getElementById('navbar-group-pills');
  if (!pillsRoot) return;
  pillsRoot.innerHTML = '';

  for (const group of tabbitGroups) {
    const groupTabs = allTabs.filter((t) => group.tabIds.includes(t.id!));
    const isCurrent = group.id === currentGroupId;

    const pill = document.createElement('div');
    pill.className = `nav-pill ${isCurrent ? 'is-active' : ''}`;
    pill.innerHTML = `
      ${getLayerIconSvg(group.colorHex || '#4A90D9', 15)}
      <span>${escapeHtml(group.title)}</span>
      <span class="nav-pill-count">${groupTabs.length}</span>
    `;

    pill.addEventListener('click', () => {
      currentGroupId = group.id;
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('groupId', group.id);
      window.history.replaceState({}, '', newUrl.toString());
      renderNavbar();
      renderGroupHome();
    });

    pillsRoot.appendChild(pill);
  }

  // 未分组标签胶囊
  const groupedTabIdSet = new Set(tabbitGroups.flatMap((g) => g.tabIds));
  const ungroupedTabs = allTabs.filter(
    (t) => !groupedTabIdSet.has(t.id!) && isEligibleForClassification(t)
  );

  if (ungroupedTabs.length > 0) {
    const isCurrent = currentGroupId === 'ungrouped';
    const unPill = document.createElement('div');
    unPill.className = `nav-pill ${isCurrent ? 'is-active' : ''}`;
    unPill.innerHTML = `
      ${getLayerIconSvg('#8E8E93', 15)}
      <span>未分组标签</span>
      <span class="nav-pill-count">${ungroupedTabs.length}</span>
    `;

    unPill.addEventListener('click', () => {
      currentGroupId = 'ungrouped';
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('groupId', 'ungrouped');
      window.history.replaceState({}, '', newUrl.toString());
      renderNavbar();
      renderGroupHome();
    });

    pillsRoot.appendChild(unPill);
  }
}

// 渲染中间核心聚合页 (1:1 规范)
function renderGroupHome() {
  const headerRoot = document.getElementById('group-detail-header');
  const gridRoot = document.getElementById('group-cards-grid');
  if (!headerRoot || !gridRoot) return;

  headerRoot.innerHTML = '';
  gridRoot.innerHTML = '';

  if (!currentGroupId || (currentGroupId !== 'ungrouped' && !tabbitGroups.some((g) => g.id === currentGroupId))) {
    gridRoot.innerHTML = `
      <div class="main-empty-state">
        <div class="empty-icon">🗂️</div>
        <div class="empty-title">这个分组还没有页面</div>
      </div>
    `;
    return;
  }

  let groupTitle = '';
  let groupColorHex = '#4A90D9';
  let tabsToDisplay: chrome.tabs.Tab[] = [];
  let currentGroup: TabbitGroup | null = null;

  if (currentGroupId === 'ungrouped') {
    groupTitle = '未分组标签';
    groupColorHex = '#8E8E93';
    const groupedTabIdSet = new Set(tabbitGroups.flatMap((g) => g.tabIds));
    tabsToDisplay = allTabs.filter((t) => !groupedTabIdSet.has(t.id!) && !t.pinned);
  } else {
    currentGroup = tabbitGroups.find((g) => g.id === currentGroupId)!;
    groupTitle = currentGroup.title;
    groupColorHex = currentGroup.colorHex || '#4A90D9';
    tabsToDisplay = allTabs.filter((t) => currentGroup!.tabIds.includes(t.id!));
  }

  // 1. 顶部聚合信息头
  headerRoot.innerHTML = `
    <div class="header-title-area">
      <div class="header-accent-line" style="background-color: ${groupColorHex};"></div>
      <h1 class="header-group-title">${escapeHtml(groupTitle)}</h1>
      <span class="header-count-text">· ${tabsToDisplay.length} 个页面</span>
      ${
        currentGroup
          ? `<button class="btn-edit-title" id="edit-title-btn" title="重命名该分组">✏️</button>`
          : ''
      }
    </div>
    <div class="header-actions">
      <button class="btn-star-all" id="star-all-btn">
        <span>☆</span> 收藏全部
      </button>
    </div>
  `;

  // 绑定重命名
  headerRoot.querySelector('#edit-title-btn')?.addEventListener('click', async () => {
    if (!currentGroup) return;
    const newTitle = prompt('请输入新的分组名称：', currentGroup.title);
    if (newTitle && newTitle.trim()) {
      currentGroup.title = newTitle.trim();
      await saveStoredGroups(tabbitGroups);
      refreshData();
    }
  });

  // 绑定批量收藏
  headerRoot.querySelector('#star-all-btn')?.addEventListener('click', async () => {
    if (tabsToDisplay.length === 0) return;
    try {
      if (chrome.bookmarks) {
        const folder = await chrome.bookmarks.create({
          title: `[I-Tab] ${groupTitle}`,
        });
        for (const t of tabsToDisplay) {
          if (t.url && t.title) {
            await chrome.bookmarks.create({
              parentId: folder.id,
              title: t.title,
              url: t.url,
            });
          }
        }
        alert(`已成功收藏 ${tabsToDisplay.length} 个网页至书签文件夹！`);
      } else {
        alert('已记录该组全部网页链接！');
      }
    } catch (err: any) {
      alert(`收藏失败: ${err.message || err}`);
    }
  });

  // 2. 渲染各标签预览卡片 (1:1 规范)
  for (const tab of tabsToDisplay) {
    gridRoot.appendChild(createPreviewCard(tab));
  }

  // 3. 末尾 "+ 新建标签页" 卡片
  const addNewCard = document.createElement('div');
  addNewCard.className = 'card-add-new-tab';
  addNewCard.innerHTML = `
    <div class="add-circle-icon">+</div>
    <div class="add-text">新建标签页</div>
  `;

  addNewCard.addEventListener('click', async () => {
    // 仅在当前窗口新建标签页，绝不在空白状态时将其写入分组
    await chrome.tabs.create({});
  });

  gridRoot.appendChild(addNewCard);
}

function getDomainColor(domain: string): { bg: string; accent: string } {
  let hash = 0;
  for (let i = 0; i < domain.length; i++) {
    hash = domain.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hues = [210, 255, 280, 330, 160, 195, 25, 145];
  const hue = hues[Math.abs(hash) % hues.length];
  return {
    bg: `linear-gradient(135deg, hsl(${hue}, 70%, 96%) 0%, hsl(${hue}, 60%, 90%) 100%)`,
    accent: `hsl(${hue}, 70%, 45%)`,
  };
}

function createPreviewCard(tab: chrome.tabs.Tab): HTMLElement {
  const card = document.createElement('div');
  card.className = 'preview-card';
  card.setAttribute('data-tab-url', tab.url || '');

  const domain = extractDomain(tab.url);
  const favicon = getFaviconUrl(tab.url, tab.favIconUrl);

  let screenshotData: string | null = null;
  if (tab.url) {
    if (screenshots[tab.url]) {
      screenshotData = screenshots[tab.url];
    } else {
      const stripped = tab.url.replace(/\/$/, '');
      screenshotData = screenshots[stripped] || screenshots[stripped + '/'] || null;
    }
  }
  const color = getDomainColor(domain);

  card.innerHTML = `
    <div class="card-screenshot-wrapper">
      ${
        screenshotData
          ? `<img class="card-screenshot-img" src="${screenshotData}" alt="网页截图" />`
          : `
          <div class="card-rich-preview" style="background: ${color.bg};">
            <div class="mock-browser-header">
              <div class="mock-dots">
                <span class="dot red"></span>
                <span class="dot yellow"></span>
                <span class="dot green"></span>
              </div>
              <div class="mock-url-pill">
                <img class="mock-favicon" src="${escapeHtml(favicon)}" alt="" />
                <span class="mock-domain">${escapeHtml(domain || '新标签页')}</span>
              </div>
            </div>
            <div class="mock-browser-body">
              <div class="mock-brand-badge" style="color: ${color.accent};">
                <img class="mock-large-favicon" src="${escapeHtml(favicon)}" alt="" />
              </div>
              <div class="mock-page-title" title="${escapeHtml(tab.title || '')}">${escapeHtml(tab.title || '网页内容')}</div>
              <div class="mock-content-blocks">
                <div class="mock-content-card"></div>
                <div class="mock-content-card short"></div>
              </div>
            </div>
          </div>
        `
      }
      <div class="screenshot-overlay">
        <div class="overlay-open-icon">↗</div>
      </div>
      <button class="card-quick-close" title="关闭标签页">✕</button>
    </div>
    <div class="card-info-area">
      <div class="card-domain-row">
        <img class="card-info-favicon" src="${escapeHtml(favicon)}" alt="" />
        <span class="card-info-domain">${escapeHtml(domain)}</span>
      </div>
      <h4 class="card-info-title" title="${escapeHtml(tab.title || '')}">${escapeHtml(
    tab.title || '无标题页面'
  )}</h4>
      <p class="card-info-desc" title="${escapeHtml(tab.url || '')}">${escapeHtml(
    tab.url || ''
  )}</p>
    </div>
  `;

  // 安全绑定图标容灾降级处理器（绝不使用内联 onerror 避免 CSP 拦截）
  card.querySelectorAll<HTMLImageElement>('.card-info-favicon, .mock-favicon, .mock-large-favicon').forEach((img) => {
    attachFaviconFallback(img, domain);
  });

  // 点击卡片：瞬间切换激活此真实标签页
  card.addEventListener('click', async () => {
    if (tab.id) {
      await chrome.tabs.update(tab.id, { active: true });
    }
  });

  // 点击关闭按钮
  card.querySelector('.card-quick-close')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (tab.id) {
      await chrome.tabs.remove(tab.id);
    }
  });

  return card;
}

document.addEventListener('DOMContentLoaded', () => {
  refreshData();
});

// 监听标签和分组变动实时刷新
chrome.tabs.onCreated.addListener(refreshData);
chrome.tabs.onUpdated.addListener(refreshData);
chrome.tabs.onRemoved.addListener(refreshData);
chrome.tabs.onActivated.addListener(refreshData);
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'TABBIT_GROUPS_UPDATED') {
    refreshData();
  }
});

// 监听截图变动，无缝为当前卡片实时换上真实截图
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.tabbit_screenshots) {
    screenshots = changes.tabbit_screenshots.newValue || {};
    document.querySelectorAll('.preview-card').forEach((card) => {
      const url = card.getAttribute('data-tab-url');
      if (url && screenshots[url]) {
        const wrapper = card.querySelector('.card-screenshot-wrapper');
        if (wrapper && !wrapper.querySelector('.card-screenshot-img')) {
          const img = document.createElement('img');
          img.className = 'card-screenshot-img';
          img.src = screenshots[url];
          img.alt = '网页截图';
          const existingMock = wrapper.querySelector('.card-rich-preview');
          if (existingMock) {
            wrapper.replaceChild(img, existingMock);
          }
        }
      }
    });
  }
});
