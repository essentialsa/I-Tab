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
let selectedGroupId: string | null = null;
let searchQuery = '';

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

async function refreshData() {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    const windowId = currentWindow.id!;

    allTabs = await chrome.tabs.query({ windowId });
    // 以全局所有存活标签为准清洗，杜绝多窗口互相擦除标签
    const allBrowserTabs = await chrome.tabs.query({});
    const globalLiveIds = new Set(allBrowserTabs.map((t) => t.id).filter(Boolean));

    const rawGroups = await getStoredGroups();
    tabbitGroups = mergeAndCleanGroups(rawGroups, globalLiveIds);
    screenshots = await getScreenshots();

    if (JSON.stringify(rawGroups) !== JSON.stringify(tabbitGroups)) {
      await saveStoredGroups(tabbitGroups);
    }

    // 默认选中第一个非空分组
    if (!selectedGroupId && tabbitGroups.length > 0) {
      selectedGroupId = tabbitGroups[0].id;
    } else if (selectedGroupId && !tabbitGroups.some((g) => g.id === selectedGroupId)) {
      selectedGroupId = tabbitGroups.length > 0 ? tabbitGroups[0].id : null;
    }

    renderSidebar();
    renderMain();

    // 触发后台为未捕获网页抓取真实快照
    const missingScreenshots = allTabs.filter(
      (t) => t.url && t.url.startsWith('http') && !screenshots[t.url]
    );
    if (missingScreenshots.length > 0) {
      chrome.runtime.sendMessage({ type: 'CAPTURE_WINDOW_TABS', windowId }).catch(() => {});
    }
  } catch (err) {
    console.error('Failed to refresh Tabbit data:', err);
  }
}

function getLayerIconSvg(color: string, size = 16): string {
  return `<svg class="pill-layer-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
    <polyline points="2 17 12 22 22 17"></polyline>
    <polyline points="2 12 12 17 22 12"></polyline>
  </svg>`;
}

// ============================================================
// 渲染左侧垂直侧边栏 (1:1 对齐规范：独立悬浮卡片 + 3px指示条 + 胶囊计数)
// ============================================================
function renderSidebar() {
  const treeRoot = document.getElementById('sidebar-tree');
  if (!treeRoot) return;
  treeRoot.innerHTML = '';

  const q = searchQuery.trim().toLowerCase();

  // 1. 渲染各分组卡片
  for (const group of tabbitGroups) {
    const groupTabs = allTabs.filter((t) => group.tabIds.includes(t.id!));
    const filteredTabs = q
      ? groupTabs.filter(
          (t) =>
            (t.title || '').toLowerCase().includes(q) ||
            (t.url || '').toLowerCase().includes(q)
        )
      : groupTabs;

    if (q && filteredTabs.length === 0) {
      continue;
    }

    const isSelected = group.id === selectedGroupId;

    // 独立分组卡片容器 (.group-card)
    const groupCard = document.createElement('div');
    groupCard.className = `group-card ${isSelected ? 'is-selected' : ''}`;

    // 左侧 3px 语义色标识条
    const indicator = document.createElement('div');
    indicator.className = 'group-card-indicator';
    indicator.style.backgroundColor = group.colorHex || '#4A90D9';
    groupCard.appendChild(indicator);

    // 分组头部：组名 + 小药丸页面计数 + 旋转折叠箭头
    const header = document.createElement('div');
    header.className = 'group-card-header';
    header.innerHTML = `
      <div class="group-header-left">
        ${getLayerIconSvg(group.colorHex || '#4A90D9', 16)}
        <span class="group-title-text" title="${escapeHtml(group.title)}">${escapeHtml(group.title)}</span>
        <span class="group-badge-pill">${groupTabs.length}</span>
      </div>
      <button class="group-collapse-btn ${group.collapsed ? 'collapsed' : ''}" title="折叠/展开">
        ▼
      </button>
    `;

    // 点击头部：在侧边栏右侧区域展开展示该组的标签画廊
    header.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.group-collapse-btn')) {
        group.collapsed = !group.collapsed;
        saveStoredGroups(tabbitGroups);
        renderSidebar();
        return;
      }

      selectedGroupId = group.id;
      renderSidebar();
      renderMain();
      // 修复隐患：普通点击侧栏分组仅在当前侧栏主区域切换查看，绝不主动弹出全屏网页新标签！
    });

    groupCard.appendChild(header);

    // 组内标签列表 (高度 36px 独立列表)
    if (!group.collapsed) {
      const tabsList = document.createElement('div');
      tabsList.className = 'group-tabs-list';

      for (const tab of filteredTabs) {
        tabsList.appendChild(createSidebarTabItem(tab));
      }

      groupCard.appendChild(tabsList);
    }

    treeRoot.appendChild(groupCard);
  }

  // 2. 渲染未加入任何分组的散落标签卡片（必须是标准 Web 页面，排除空白页）
  const groupedTabIdSet = new Set(tabbitGroups.flatMap((g) => g.tabIds));
  const ungroupedTabs = allTabs.filter(
    (t) => !groupedTabIdSet.has(t.id!) && isEligibleForClassification(t)
  );

  const filteredUngrouped = q
    ? ungroupedTabs.filter(
        (t) =>
          (t.title || '').toLowerCase().includes(q) ||
          (t.url || '').toLowerCase().includes(q)
      )
    : ungroupedTabs;

  if (filteredUngrouped.length > 0) {
    const unCard = document.createElement('div');
    unCard.className = `group-card ${selectedGroupId === 'ungrouped' ? 'is-selected' : ''}`;

    const unIndicator = document.createElement('div');
    unIndicator.className = 'group-card-indicator';
    unIndicator.style.backgroundColor = '#8E8E93';
    unCard.appendChild(unIndicator);

    const unHeader = document.createElement('div');
    unHeader.className = 'group-card-header';
    unHeader.innerHTML = `
      <div class="group-header-left">
        ${getLayerIconSvg('#8E8E93', 16)}
        <span class="group-title-text">未分组标签</span>
        <span class="group-badge-pill">${ungroupedTabs.length}</span>
      </div>
    `;

    unHeader.addEventListener('click', () => {
      selectedGroupId = 'ungrouped';
      renderSidebar();
      renderMain();
    });

    unCard.appendChild(unHeader);

    const unTabsList = document.createElement('div');
    unTabsList.className = 'group-tabs-list';

    for (const tab of filteredUngrouped) {
      unTabsList.appendChild(createSidebarTabItem(tab));
    }

    unCard.appendChild(unTabsList);
    treeRoot.appendChild(unCard);
  }
}

function createSidebarTabItem(tab: chrome.tabs.Tab): HTMLElement {
  const item = document.createElement('div');
  item.className = `group-tab-row ${tab.active ? 'is-active' : ''}`;

  const domain = extractDomain(tab.url);
  const favicon = getFaviconUrl(tab.url, tab.favIconUrl);

  item.innerHTML = `
    <img class="group-tab-favicon" src="${escapeHtml(favicon)}" alt="" />
    <span class="group-tab-title" title="${escapeHtml(tab.title || '')}">${escapeHtml(
    tab.title || '无标题页面'
  )}</span>
    <button class="group-tab-close" title="关闭标签页">✕</button>
  `;

  // 安全绑定图标容灾降级处理器
  const img = item.querySelector<HTMLImageElement>('.group-tab-favicon');
  if (img) {
    attachFaviconFallback(img, domain);
  }

  // 点击标签项：瞬间激活并跳转到真实标签页
  item.addEventListener('click', async () => {
    if (tab.id) {
      await chrome.tabs.update(tab.id, { active: true });
    }
  });

  // 点击关闭按钮
  item.querySelector('.group-tab-close')?.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (tab.id) {
      await chrome.tabs.remove(tab.id);
    }
  });

  return item;
}

// ============================================================
// 渲染右侧主工作台预览画廊 (1:1 规范：全屏网格 + 聚合头部 + 16:10卡片)
// ============================================================
function renderMain() {
  const mainRoot = document.getElementById('tabbit-main');
  if (!mainRoot) return;
  mainRoot.innerHTML = '';

  if (!selectedGroupId || (selectedGroupId !== 'ungrouped' && !tabbitGroups.some((g) => g.id === selectedGroupId))) {
    mainRoot.innerHTML = `
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

  if (selectedGroupId === 'ungrouped') {
    groupTitle = '未分组标签';
    groupColorHex = '#8E8E93';
    const groupedTabIdSet = new Set(tabbitGroups.flatMap((g) => g.tabIds));
    tabsToDisplay = allTabs.filter((t) => !groupedTabIdSet.has(t.id!) && !t.pinned);
  } else {
    currentGroup = tabbitGroups.find((g) => g.id === selectedGroupId)!;
    groupTitle = currentGroup.title;
    groupColorHex = currentGroup.colorHex || '#4A90D9';
    tabsToDisplay = allTabs.filter((t) => currentGroup!.tabIds.includes(t.id!));
  }

  // 1. 分组头部信息区：装饰色条 + 28px/700标题 + · N 个页面 + ✏️ 编辑 + ☆ 收藏全部
  const header = document.createElement('div');
  header.className = 'main-header';

  header.innerHTML = `
    <div class="header-title-box">
      <button class="btn-back-sidebar" id="back-sidebar-btn" title="返回侧边栏">← 返回</button>
      <div class="header-accent-line" style="background-color: ${groupColorHex};"></div>
      <h2 class="header-group-title" id="editable-group-title">${escapeHtml(groupTitle)}</h2>
      <span class="header-count-text">· ${tabsToDisplay.length} 个页面</span>
      ${
        currentGroup
          ? `<button class="btn-edit-title" id="edit-title-btn" title="重命名该分组">✏️</button>`
          : ''
      }
    </div>
    <div class="main-actions-box">
      <button class="btn-star-all" id="star-all-btn">
        <span>☆</span> 收藏全部
      </button>
    </div>
  `;

  // 绑定返回侧边栏事件 (用于窄屏自适应)
  header.querySelector('#back-sidebar-btn')?.addEventListener('click', () => {
    document.getElementById('app-root')?.classList.remove('show-preview');
  });

  // 绑定编辑标题
  const editBtn = header.querySelector('#edit-title-btn');
  if (editBtn && currentGroup) {
    editBtn.addEventListener('click', async () => {
      const newTitle = prompt('请输入新的分组名称：', currentGroup!.title);
      if (newTitle && newTitle.trim()) {
        currentGroup!.title = newTitle.trim();
        await saveStoredGroups(tabbitGroups);
        refreshData();
      }
    });
  }

  // 绑定收藏全部
  header.querySelector('#star-all-btn')?.addEventListener('click', async () => {
    if (tabsToDisplay.length === 0) return;
    try {
      if (chrome.bookmarks) {
        const folder = await chrome.bookmarks.create({
          title: `[Tabbit] ${groupTitle}`,
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
        alert(`已成功收藏 ${tabsToDisplay.length} 个网页至书签！`);
      } else {
        alert('已记录该组全部网页链接！');
      }
    } catch (err: any) {
      alert(`收藏失败: ${err.message || err}`);
    }
  });

  mainRoot.appendChild(header);

  // 2. 网页预览卡片响应式网格 (1:1 规范)
  const grid = document.createElement('div');
  grid.className = 'preview-grid';

  for (const tab of tabsToDisplay) {
    grid.appendChild(createPreviewCard(tab));
  }

  // 3. 末尾的 "+ 新建标签页" 卡片
  const addNewCard = document.createElement('div');
  addNewCard.className = 'card-add-new-tab';
  addNewCard.innerHTML = `
    <div class="add-circle-icon">+</div>
    <div class="add-text">新建标签页</div>
  `;

  addNewCard.addEventListener('click', async () => {
    // 仅在当前窗口新建标签页，绝不在空白状态时直接硬编码绑入分组
    await chrome.tabs.create({});
  });

  grid.appendChild(addNewCard);
  mainRoot.appendChild(grid);
}

// ============================================================
// 预览卡片 (1:1 规范结构：上部60%缩略图 + 骨架屏 + 下部信息区)
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

// ============================================================
// 创建单个标签卡片预览
// ============================================================
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
          ? `<img class="card-screenshot-img" src="${screenshotData}" alt="网页缩略图" />`
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
      <button class="card-quick-close" title="关闭">✕</button>
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

  // 点击卡片：切换至真实标签页
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

// 在浏览器中间大视口区域打开该组的卡片预览大主页 (1:1 规范)
async function openGroupInCenter(groupId: string) {
  try {
    const targetUrl = chrome.runtime.getURL(`src/preview/index.html?groupId=${groupId}`);
    const currentWindow = await chrome.windows.getCurrent();
    const tabs = await chrome.tabs.query({ windowId: currentWindow.id });
    const existing = tabs.find(
      (t) => t.url && t.url.startsWith(chrome.runtime.getURL('src/preview/index.html'))
    );
    if (existing && existing.id) {
      await chrome.tabs.update(existing.id, { url: targetUrl, active: true });
    } else {
      await chrome.tabs.create({ url: targetUrl, active: true });
    }
  } catch (err) {
    console.warn('Failed to open group in center tab:', err);
  }
}

// ============================================================
// 按钮与事件交互
// ============================================================
async function handleOrganize() {
  const aiBtn = document.getElementById('sidebar-ai-btn') as HTMLButtonElement;
  if (aiBtn) {
    aiBtn.classList.add('is-loading');
    aiBtn.disabled = true;
  }

  try {
    const currentWindow = await chrome.windows.getCurrent();
    await chrome.runtime.sendMessage({
      type: 'TRIGGER_ORGANIZE',
      windowId: currentWindow?.id,
    });
  } catch (err: any) {
    alert(`整理失败: ${err.message || err}`);
  } finally {
    if (aiBtn) {
      aiBtn.classList.remove('is-loading');
      aiBtn.disabled = false;
    }
    await refreshData();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // 绑定侧栏顶部莫比乌斯环 AI 智能整理按钮
  document.getElementById('sidebar-ai-btn')?.addEventListener('click', handleOrganize);

  // 绑定搜索输入
  const searchInput = document.getElementById('tab-search') as HTMLInputElement;
  const clearBtn = document.getElementById('clear-search-btn') as HTMLButtonElement;

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      if (clearBtn) {
        clearBtn.style.display = searchQuery ? 'block' : 'none';
      }
      renderSidebar();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      searchQuery = '';
      clearBtn.style.display = 'none';
      renderSidebar();
    });
  }

  // 绑定在浏览器中间大页面全屏打开 Group Home 预览画廊 (1:1 截图 2)
  document.getElementById('open-full-btn')?.addEventListener('click', () => {
    openGroupInCenter(selectedGroupId || '');
  });

  // 绑定左侧底部新建标签页
  document.getElementById('sidebar-new-tab-btn')?.addEventListener('click', () => {
    chrome.tabs.create({});
  });

  // 挂载初次加载
  refreshData();
});

// 监听浏览器标签与分组变更，实时秒级双向同步
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
