/**
 * Favicon 安全与多级容灾加载服务
 * 
 * 1. 优先使用 Chrome MV3 原生缓存端点 chrome-extension://<id>/_favicon/?pageUrl=...
 * 2. 发生网络或跨域加载异常时，通过 DOM 事件监听（绝不使用内联 onerror 避免 CSP 拦截）降级为 Google Favicon API
 * 3. 终极容灾：渲染精致的高清矢量 Monogram 首字母徽标或网络地球图标，100% 避免浏览器原生裂图占位符
 */

export function getFaviconUrl(pageUrl?: string, originalFavIconUrl?: string): string {
  if (pageUrl && pageUrl.startsWith('http')) {
    // 优先使用 Chrome MV3 官方 favicon 缓存端点，不受 CORS 和防盗链限制
    if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
      return `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;
    }
  }

  if (originalFavIconUrl && (originalFavIconUrl.startsWith('http') || originalFavIconUrl.startsWith('data:'))) {
    return originalFavIconUrl;
  }

  // 默认优雅矢量地球图标
  return createGlobeSvg();
}

/**
 * 监听图片加载错误，实现无裂图的多级降级：
 * 阶段 1：切换至 Google Favicon CDN
 * 阶段 2：切换至首字母彩色矢量 Monogram
 */
export function attachFaviconFallback(img: HTMLImageElement, domain?: string): void {
  img.addEventListener('error', () => {
    const stage = parseInt(img.dataset.fallbackStage || '0', 10);

    if (stage === 0 && domain && domain !== 'other' && domain !== '新标签页') {
      img.dataset.fallbackStage = '1';
      img.src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`;
      return;
    }

    // 终极保护：渲染精致单字矢量徽标或地球图标
    img.dataset.fallbackStage = '2';
    img.src = createMonogramSvg(domain);
  });
}

export function createMonogramSvg(domain?: string): string {
  const cleanDomain = (domain || '').replace(/^www\./, '');
  const letter = (cleanDomain[0] || 'W').toUpperCase();

  // 根据域名首字母计算和谐的高雅低饱和色相
  const charCode = letter.charCodeAt(0);
  const hue = (charCode * 37) % 360;
  const bgColor = `hsl(${hue}, 45%, 85%)`;
  const textColor = `hsl(${hue}, 60%, 30%)`;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">
    <rect width="32" height="32" rx="8" fill="${bgColor}"/>
    <text x="16" y="21" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="16" font-weight="600" fill="${textColor}" text-anchor="middle">${letter}</text>
  </svg>`;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function createGlobeSvg(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="#94a3b8" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
