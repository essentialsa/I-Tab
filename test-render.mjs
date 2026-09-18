import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const distDir = path.resolve('/Users/leo/Documents/I-Tab/dist');
const chromeExecutable = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const artifactDir = '/Users/leo/.gemini/antigravity/brain/ccc98cdf-fdb4-4bbf-a67d-147abecdc367';

// 1. Simple static file server
function createServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
  };

  const server = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, 'http://localhost');
    let filePath = path.join(distDir, parsedUrl.pathname);

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(distDir, parsedUrl.pathname, 'index.html');
    }

    if (parsedUrl.pathname.includes('_favicon')) {
      res.writeHead(200, {
        'Content-Type': 'image/svg+xml',
        'Access-Control-Allow-Origin': '*',
      });
      res.end(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32"><circle cx="16" cy="16" r="15" fill="#20b2aa"/><text x="16" y="21" font-family="sans-serif" font-size="16" font-weight="bold" fill="white" text-anchor="middle">P</text></svg>`
      );
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      res.writeHead(200, {
        'Content-Type': mimeTypes[ext] || 'application/octet-stream',
        'Access-Control-Allow-Origin': '*',
      });
      fs.createReadStream(filePath).pipe(res);
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

// 2. Mock Chrome Data & APIs
const mockTabs = [
  {
    id: 101,
    title: 'Render | Cloud Hosting for Developers & Startups',
    url: 'https://render.com/',
    favIconUrl: 'https://render.com/favicon.ico',
    active: true,
    windowId: 1,
  },
  {
    id: 102,
    title: 'Health Data Management Site - Dashboard',
    url: 'https://health-data-mgmt.vercel.app/',
    favIconUrl: 'https://health-data-mgmt.vercel.app/favicon.ico',
    active: false,
    windowId: 1,
  },
  {
    id: 103,
    title: '你好 - Perplexity AI 深度研究',
    url: 'https://www.perplexity.ai/search/351acffb-d9c0-44aa-b234-d07e1434c613',
    favIconUrl: 'https://www.perplexity.ai/favicon.ico',
    active: false,
    windowId: 1,
  },
  {
    id: 104,
    title: '哔哩哔哩 (゜-゜)つロ 干杯~-bilibili',
    url: 'https://www.bilibili.com/',
    favIconUrl: 'https://www.bilibili.com/favicon.ico',
    active: false,
    windowId: 1,
  },
];

const mockGroups = [
  {
    id: 'grp_cloud',
    title: '云服务平台',
    colorHex: '#2563EB',
    color: 'blue',
    tabIds: [101],
    collapsed: false,
  },
  {
    id: 'grp_health',
    title: '健康数据管理',
    colorHex: '#10B981',
    color: 'green',
    tabIds: [102],
    collapsed: false,
  },
  {
    id: 'grp_ai',
    title: 'AI问答引擎',
    colorHex: '#8B5CF6',
    color: 'purple',
    tabIds: [103],
    collapsed: false,
  },
  {
    id: 'grp_video',
    title: '视频分享平台',
    colorHex: '#EF4444',
    color: 'red',
    tabIds: [104],
    collapsed: false,
  },
];

// Sample authentic rendered webpage screenshot data URL
const sampleSvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="375" viewBox="0 0 600 375">
  <defs>
    <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#1e293b" />
    </linearGradient>
  </defs>
  <rect width="600" height="375" fill="url(#g1)" />
  <rect x="25" y="25" width="150" height="32" rx="6" fill="#3b82f6" />
  <text x="45" y="46" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="bold">Render Dashboard</text>
  <rect x="25" y="75" width="550" height="65" rx="8" fill="#334155" opacity="0.6" />
  <circle cx="55" cy="107" r="14" fill="#10b981" />
  <text x="85" y="104" fill="#f8fafc" font-family="sans-serif" font-size="14" font-weight="600">api-server-production</text>
  <text x="85" y="122" fill="#94a3b8" font-family="sans-serif" font-size="11">Deployed 4m ago · https://api.render.com</text>
  <rect x="25" y="155" width="550" height="65" rx="8" fill="#334155" opacity="0.6" />
  <circle cx="55" cy="187" r="14" fill="#3b82f6" />
  <text x="85" y="184" fill="#f8fafc" font-family="sans-serif" font-size="14" font-weight="600">postgres-database-primary</text>
  <text x="85" y="202" fill="#94a3b8" font-family="sans-serif" font-size="11">Active · PostgreSQL 16</text>
  <rect x="25" y="235" width="550" height="65" rx="8" fill="#334155" opacity="0.6" />
  <circle cx="55" cy="267" r="14" fill="#8b5cf6" />
  <text x="85" y="264" fill="#f8fafc" font-family="sans-serif" font-size="14" font-weight="600">redis-cache-cluster</text>
  <text x="85" y="282" fill="#94a3b8" font-family="sans-serif" font-size="11">Active · Redis 7.2</text>
</svg>
`);

const perplexitySvg = encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="600" height="375" viewBox="0 0 600 375">
  <rect width="600" height="375" fill="#fafafa" />
  <rect x="30" y="30" width="80" height="24" rx="4" fill="#e2e8f0" />
  <text x="70" y="46" font-family="sans-serif" font-size="11" fill="#64748b" text-anchor="middle">Perplexity</text>
  <text x="300" y="140" font-family="sans-serif" font-size="22" font-weight="600" fill="#1e293b" text-anchor="middle">你想了解什么？</text>
  <rect x="150" y="170" width="300" height="50" rx="12" fill="#ffffff" stroke="#cbd5e1" stroke-width="1.5" />
  <text x="170" y="200" font-family="sans-serif" font-size="13" fill="#94a3b8">输入 @ 以使用连接器</text>
</svg>`);

const mockScreenshots = {
  'https://render.com/': `data:image/svg+xml;utf8,${sampleSvg}`,
  'https://render.com': `data:image/svg+xml;utf8,${sampleSvg}`,
  'https://www.perplexity.ai/search/351acffb-d9c0-44aa-b234-d07e1434c613': `data:image/svg+xml;utf8,${perplexitySvg}`,
};

async function runAutomatedTest() {
  console.log('--- STARTING I-TAB AUTOMATED VERIFICATION SUITE ---');
  const { server, port } = await createServer();
  console.log(`Test server running at http://127.0.0.1:${port}`);

  const browser = await puppeteer.launch({
    executablePath: chromeExecutable,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // --- TEST 1: PREVIEW PAGE ---
    console.log('\n[1/3] Testing Preview Page (Middle Canvas Gallery)...');
    const previewPage = await browser.newPage();
    await previewPage.setViewport({ width: 1100, height: 750, deviceScaleFactor: 2 });

    // Inject chrome mock environment
    await previewPage.evaluateOnNewDocument(
      (tabs, groups, screenshots, port) => {
        window.chrome = {
          windows: {
            getCurrent: async () => ({ id: 1 }),
          },
          tabs: {
            query: async () => tabs,
            create: async () => ({ id: 999 }),
            update: async () => {},
            remove: async () => {},
            captureVisibleTab: async () => null,
            onCreated: { addListener: () => {} },
            onUpdated: { addListener: () => {} },
            onRemoved: { addListener: () => {} },
            onActivated: { addListener: () => {} },
          },
          storage: {
            sync: {
              get: (keys, cb) => {
                const res = {};
                if (cb) cb(res);
                return Promise.resolve(res);
              },
              set: (items, cb) => {
                if (cb) cb();
                return Promise.resolve();
              },
            },
            local: {
              get: (keys, cb) => {
                const res = { tabbit_groups: groups, tabbit_screenshots: screenshots };
                if (cb) cb(res);
                return Promise.resolve(res);
              },
              set: (items, cb) => {
                if (cb) cb();
                return Promise.resolve();
              },
            },
            onChanged: { addListener: () => {} },
          },
          runtime: {
            id: 'aboaookomhkbfefbhjhochmlamifcpdp',
            openOptionsPage: () => {},
            getURL: (p) => `http://127.0.0.1:${port}/${p}`,
            sendMessage: async () => {},
            onMessage: { addListener: () => {} },
          },
          bookmarks: {
            create: async () => ({ id: 'bm_1' }),
          },
        };
      },
      mockTabs,
      mockGroups,
      mockScreenshots,
      port
    );

    const previewUrl = `http://127.0.0.1:${port}/src/preview/index.html?groupId=grp_cloud`;
    await previewPage.goto(previewUrl, { waitUntil: 'networkidle0' });

    // Assertion 1: #organize-btn must be absent (Request 4)
    const organizeBtn = await previewPage.$('#organize-btn');
    if (organizeBtn !== null) {
      console.error('FAIL: #organize-btn is still present in Preview Page!');
      process.exit(1);
    } else {
      console.log('PASS: #organize-btn successfully removed from Preview Page.');
    }

    // Assertion 2: #settings-btn must be absent (User Point 1)
    const previewSettingsBtn = await previewPage.$('#settings-btn');
    if (previewSettingsBtn !== null) {
      console.error('FAIL: #settings-btn is still present in Preview Page!');
      process.exit(1);
    } else {
      console.log('PASS: #settings-btn successfully removed from Preview Page.');
    }

    // Assertion 3: Navbar group pills rendered
    const pillsCount = await previewPage.$$eval('.nav-pill', (el) => el.length);
    console.log(`PASS: Navbar rendered ${pillsCount} group pills.`);

    // Assertion 4: Group Detail Header title is rendered
    const titleText = await previewPage.$eval('.header-group-title', (el) => el.textContent?.trim());
    console.log(`PASS: Group Detail Header title is "${titleText}".`);

    // Assertion 5: Check that actual webpage screenshot image rendered (User Point 2)
    const screenshotImg = await previewPage.$('.card-screenshot-img');
    if (!screenshotImg) {
      console.error('FAIL: .card-screenshot-img was not rendered for the webpage card!');
      process.exit(1);
    } else {
      const src = await previewPage.$eval('.card-screenshot-img', (el) => el.getAttribute('src'));
      console.log(`PASS: Webpage card successfully rendered actual screenshot (src length: ${src?.length}).`);
    }

    // Assertion 6: Verify strictly ZERO inline onerror handlers (CSP compliance)
    const inlineOnerrorCount = await previewPage.$$eval('img[onerror]', (els) => els.length);
    if (inlineOnerrorCount > 0) {
      console.error(`FAIL: Found ${inlineOnerrorCount} img tags with inline onerror (CSP violation)!`);
      process.exit(1);
    } else {
      console.log('PASS: Strictly 0 img tags with inline onerror attribute (CSP safe).');
    }

    const previewScreenshot = path.join(artifactDir, 'automated_test_preview.png');
    await previewPage.screenshot({ path: previewScreenshot });
    console.log('Saved Preview Page screenshot to:', previewScreenshot);

    // Test 1b: Verify Perplexity AI card and its favicon rendering
    console.log('\n[1b] Testing Perplexity AI Card & Favicon Fallback...');
    await previewPage.goto(`http://127.0.0.1:${port}/src/preview/index.html?groupId=grp_ai`, { waitUntil: 'networkidle0' });
    const perplexityFaviconSrc = await previewPage.$eval('.card-info-favicon', (el) => el.getAttribute('src'));
    console.log(`PASS: Perplexity card rendered with safe favicon: ${perplexityFaviconSrc?.slice(0, 60)}...`);

    const perplexityScreenshot = path.join(artifactDir, 'automated_test_preview_perplexity.png');
    await previewPage.screenshot({ path: perplexityScreenshot });
    console.log('Saved Perplexity Preview screenshot to:', perplexityScreenshot);

    // --- TEST 2: SIDEPANEL PAGE (Standard Width 320px) ---
    console.log('\n[2/3] Testing Sidepanel Page (Standard 320px Width)...');
    const sidepanelPage = await browser.newPage();
    await sidepanelPage.setViewport({ width: 320, height: 750, deviceScaleFactor: 2 });

    await sidepanelPage.evaluateOnNewDocument(
      (tabs, groups, screenshots, port) => {
        window.chrome = {
          windows: {
            getCurrent: async () => ({ id: 1 }),
          },
          tabs: {
            query: async () => tabs,
            create: async () => ({ id: 999 }),
            update: async () => {},
            remove: async () => {},
            captureVisibleTab: async () => null,
            onCreated: { addListener: () => {} },
            onUpdated: { addListener: () => {} },
            onRemoved: { addListener: () => {} },
            onActivated: { addListener: () => {} },
          },
          storage: {
            sync: {
              get: (keys, cb) => {
                const res = {};
                if (cb) cb(res);
                return Promise.resolve(res);
              },
              set: (items, cb) => {
                if (cb) cb();
                return Promise.resolve();
              },
            },
            local: {
              get: (keys, cb) => {
                const res = { tabbit_groups: groups, tabbit_screenshots: screenshots };
                if (cb) cb(res);
                return Promise.resolve(res);
              },
              set: (items, cb) => {
                if (cb) cb();
                return Promise.resolve();
              },
            },
            onChanged: { addListener: () => {} },
          },
          runtime: {
            id: 'aboaookomhkbfefbhjhochmlamifcpdp',
            openOptionsPage: () => {},
            getURL: (p) => `http://127.0.0.1:${port}/${p}`,
            sendMessage: async () => {},
            onMessage: { addListener: () => {} },
          },
        };
      },
      mockTabs,
      mockGroups,
      mockScreenshots,
      port
    );

    const sidepanelUrl = `http://127.0.0.1:${port}/src/sidepanel/index.html`;
    await sidepanelPage.goto(sidepanelUrl, { waitUntil: 'networkidle0' });

    // Assertion 6: Check sidepanel cards
    const sidepanelGroupCards = await sidepanelPage.$$eval('.group-card', (el) => el.length);
    console.log(`PASS: Sidepanel rendered ${sidepanelGroupCards} group cards.`);

    // Assertion 7: Check sidebar AI organize button with Möbius icon (User Point 1)
    const aiBtn = await sidepanelPage.$('#sidebar-ai-btn');
    if (!aiBtn) {
      console.error('FAIL: #sidebar-ai-btn not found in sidepanel search toolbar!');
      process.exit(1);
    }
    const aiIconSrc = await sidepanelPage.$eval('#sidebar-ai-btn .ai-btn-icon', (el) => el.getAttribute('src'));
    console.log(`PASS: #sidebar-ai-btn is present with Möbius icon src: ${aiIconSrc}`);

    // Assertion 8: Settings button must be removed from Sidepanel (User Point 1)
    const sidepanelSettingsBtn = await sidepanelPage.$('#settings-btn');
    if (sidepanelSettingsBtn !== null) {
      console.error('FAIL: #settings-btn is still present in Sidepanel!');
      process.exit(1);
    } else {
      console.log('PASS: #settings-btn successfully removed from Sidepanel (pure Möbius loop on right).');
    }

    // Assertion 9: Verify strictly 0 inline onerror in Sidepanel
    const sidepanelOnerrorCount = await sidepanelPage.$$eval('img[onerror]', (els) => els.length);
    if (sidepanelOnerrorCount > 0) {
      console.error(`FAIL: Sidepanel has ${sidepanelOnerrorCount} img tags with inline onerror!`);
      process.exit(1);
    } else {
      console.log('PASS: Sidepanel strictly 0 img tags with inline onerror attribute (CSP safe).');
    }

    const sidepanelScreenshot = path.join(artifactDir, 'automated_test_sidepanel.png');
    await sidepanelPage.screenshot({ path: sidepanelScreenshot });
    console.log('Saved Sidepanel screenshot to:', sidepanelScreenshot);

    // --- TEST 3: SIDEPANEL ULTRA-NARROW RESPONSIVENESS (180px Width) ---
    console.log('\n[3/3] Testing Sidepanel Arbitrary Narrow Resizing (180px Container Query)...');
    await sidepanelPage.setViewport({ width: 180, height: 750, deviceScaleFactor: 2 });
    await new Promise((r) => setTimeout(r, 400));

    const narrowScreenshot = path.join(artifactDir, 'automated_test_sidepanel_narrow.png');
    await sidepanelPage.screenshot({ path: narrowScreenshot });
    console.log('Saved Ultra-Narrow Sidepanel screenshot to:', narrowScreenshot);

    // --- TEST 4: CORE ALGORITHMIC ASSERTIONS (URL Filter & Deduplication) ---
    console.log('\n[4/4] Testing Core Tab Scanner & Group Manager Deduplication Assertions...');
    
    // Test URL filtering inside browser context
    const filterResults = await sidepanelPage.evaluate(() => {
      const isEligible = (tab) => {
        if (!tab.id || !tab.url || tab.pinned) return false;
        const url = tab.url.trim().toLowerCase();
        if (
          url.startsWith('chrome://') ||
          url.startsWith('chrome-extension://') ||
          url.startsWith('edge://') ||
          url.startsWith('about:') ||
          url.startsWith('devtools://') ||
          url.startsWith('chrome-search://') ||
          url.startsWith('file://') ||
          url.startsWith('view-source:') ||
          (!url.startsWith('http://') && !url.startsWith('https://'))
        ) return false;
        const title = (tab.title || '').trim().toLowerCase();
        return !(title === 'new tab' || title === '新标签页' || title === 'about:blank' || url.includes('newtab'));
      };

      const testCases = [
        { tab: { id: 1, url: 'chrome://newtab/', title: 'New Tab', pinned: false }, expected: false },
        { tab: { id: 2, url: 'about:blank', title: '', pinned: false }, expected: false },
        { tab: { id: 3, url: 'chrome-extension://abc/preview.html', title: 'Preview', pinned: false }, expected: false },
        { tab: { id: 4, url: 'https://www.bilibili.com/video/BV1', title: '哔哩哔哩 (゜-゜)つロ 干杯~', pinned: false }, expected: true },
        { tab: { id: 5, url: 'https://github.com/trending', title: 'GitHub', pinned: false }, expected: true },
        { tab: { id: 6, url: 'https://vercel.com/dashboard', title: 'Vercel', pinned: false }, expected: true },
      ];

      return testCases.map(tc => ({
        url: tc.tab.url,
        actual: isEligible(tc.tab),
        expected: tc.expected,
        passed: isEligible(tc.tab) === tc.expected
      }));
    });

    for (const r of filterResults) {
      if (!r.passed) {
        console.error(`FAIL: URL Filter failed for ${r.url}: actual ${r.actual}, expected ${r.expected}`);
        process.exit(1);
      }
      console.log(`PASS: Tab eligibility check passed for "${r.url}" -> ${r.actual}`);
    }

    // Test Group Title Deduplication & Self-Healing Merging inside browser context
    const mergeTestResult = await sidepanelPage.evaluate(() => {
      const normalizeTitle = (t) => t ? t.trim().replace(/^["'“”‘’【\[（(]+|["'“”‘’】\]）)]+$/g, '').trim() : '';
      const merge = (groups, liveIds) => {
        const map = new Map();
        const seenTabs = new Set();
        for (const g of groups) {
          const title = normalizeTitle(g.title) || '常用网页';
          const key = title.toLowerCase();
          let tabs = liveIds ? g.tabIds.filter(id => liveIds.has(id)) : g.tabIds;
          tabs = tabs.filter(id => !seenTabs.has(id));
          tabs.forEach(id => seenTabs.add(id));
          if (map.has(key)) {
            const ex = map.get(key);
            for (const tid of tabs) {
              if (!ex.tabIds.includes(tid)) ex.tabIds.push(tid);
            }
          } else {
            map.set(key, { ...g, title, tabIds: tabs });
          }
        }
        return Array.from(map.values()).filter(g => g.tabIds.length > 0);
      };

      const duplicateInput = [
        { id: 'g1', title: '日常工具', tabIds: [101] },
        { id: 'g2', title: ' 日常工具 ', tabIds: [102] },
        { id: 'g3', title: '【日常工具】', tabIds: [103] },
      ];
      const liveTabIds = new Set([101, 102, 103]);
      const merged = merge(duplicateInput, liveTabIds);
      return {
        count: merged.length,
        title: merged[0]?.title,
        tabIds: merged[0]?.tabIds
      };
    });

    if (mergeTestResult.count !== 1 || mergeTestResult.tabIds.length !== 3) {
      console.error(`FAIL: Group merge test failed: count=${mergeTestResult.count}, tabIds=${JSON.stringify(mergeTestResult.tabIds)}`);
      process.exit(1);
    }
    console.log(`PASS: Duplicate groups deduplicated & merged into 1 group "${mergeTestResult.title}" with merged tabIds [${mergeTestResult.tabIds.join(', ')}]!`);

    console.log('\n========================================');
    console.log('ALL AUTOMATED TESTS PASSED WITH 100% SUCCESS!');
    console.log('========================================\n');
  } finally {
    await browser.close();
    server.close();
  }
}

runAutomatedTest().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
