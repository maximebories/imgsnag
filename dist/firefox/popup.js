// imgsnag — Popup

(function () {
  'use strict';

  const selectedUrls = new Set();
  const allUrls = new Set();

  // Derived inline-SVG items carry their markup as a data: URL (RFC #118)
  const SVG_DATA_PREFIX = 'data:image/svg+xml;charset=utf-8,';

  // Visual dedup: the same photo can appear under several genuinely different
  // URLs (CDN crops, zoom variants). A 64-bit dHash fingerprint groups
  // near-identical thumbnails; only the largest of each group stays visible.
  const HASH_W = 9, HASH_H = 8;
  const DEDUPE_HAMMING = 6;
  const DEDUPE_MAX_CELLS = 300;
  const hashCache = new Map();
  const imageEntries = [];

  async function dHash(url) {
    if (hashCache.has(url)) return hashCache.get(url);
    let hash = null;
    try {
      // fetch → blob keeps the canvas untainted (extension host permissions);
      // the bytes are HTTP-cache hits since the grid just rendered this URL
      const blob = await (await fetch(url)).blob();
      const bmp = await createImageBitmap(blob, { resizeWidth: HASH_W, resizeHeight: HASH_H, resizeQuality: 'low' });
      const canvas = document.createElement('canvas');
      canvas.width = HASH_W;
      canvas.height = HASH_H;
      const c2d = canvas.getContext('2d', { willReadFrequently: true });
      c2d.drawImage(bmp, 0, 0, HASH_W, HASH_H);
      bmp.close();
      const d = c2d.getImageData(0, 0, HASH_W, HASH_H).data;
      const gray = new Array(HASH_W * HASH_H);
      for (let i = 0; i < gray.length; i++) {
        gray[i] = d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114;
      }
      let hi = 0, lo = 0, bit = 0;
      for (let y = 0; y < HASH_H; y++) {
        for (let x = 0; x < HASH_W - 1; x++) {
          const v = gray[y * HASH_W + x] > gray[y * HASH_W + x + 1] ? 1 : 0;
          if (bit < 32) lo = (lo << 1) | v; else hi = (hi << 1) | v;
          bit++;
        }
      }
      hash = { hi, lo };
    } catch {
      hash = null; // best-effort: unhashable images are never hidden
    }
    hashCache.set(url, hash);
    return hash;
  }

  function popcount32(n) {
    n = n - ((n >> 1) & 0x55555555);
    n = (n & 0x33333333) + ((n >> 2) & 0x33333333);
    return (((n + (n >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
  }

  function hammingDistance(a, b) {
    return popcount32(a.hi ^ b.hi) + popcount32(a.lo ^ b.lo);
  }

  // Pure: given [{url, hash, area, aspect}], return the urls of every
  // near-duplicate that is NOT the largest of its cluster.
  function pickDuplicateUrls(entries) {
    const toHide = [];
    const buckets = new Map();
    for (const e of entries) {
      if (!e.hash) continue;
      const key = Math.round(e.aspect * 10) / 10; // compare like aspects only
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(e);
    }
    for (const group of buckets.values()) {
      const clusters = [];
      for (const e of group) {
        let placed = false;
        for (const c of clusters) {
          if (hammingDistance(c[0].hash, e.hash) <= DEDUPE_HAMMING) {
            c.push(e);
            placed = true;
            break;
          }
        }
        if (!placed) clusters.push([e]);
      }
      for (const c of clusters) {
        if (c.length < 2) continue;
        c.sort((a, b) => b.area - a.area);
        for (let i = 1; i < c.length; i++) toHide.push(c[i].url);
      }
    }
    return toHide;
  }

  let dedupeTimer = null;
  let dedupeRunning = false;

  function scheduleDedupe() {
    if (dedupeTimer) clearTimeout(dedupeTimer);
    dedupeTimer = setTimeout(runDedupe, 900);
  }

  async function runDedupe() {
    if (dedupeRunning) { scheduleDedupe(); return; }
    dedupeRunning = true;
    try {
      const candidates = imageEntries
        .filter(e => !e.cell.hidden && !e.url.startsWith('data:'))
        .slice(0, DEDUPE_MAX_CELLS);
      for (let i = 0; i < candidates.length; i += 8) {
        await Promise.all(candidates.slice(i, i + 8).map(async e => { e.hash = await dHash(e.url); }));
      }
      const entries = candidates.map(e => {
        const img = e.cell.querySelector('img');
        const w = e.width || img?.naturalWidth || 0;
        const h = e.height || img?.naturalHeight || 0;
        return { url: e.url, hash: e.hash, area: w * h, aspect: h > 0 ? w / h : 0 };
      });
      for (const url of pickDuplicateUrls(entries)) {
        const entry = imageEntries.find(e => e.url === url);
        if (entry) {
          entry.cell.hidden = true;
          allUrls.delete(url);
          selectedUrls.delete(url);
        }
      }
      updateCounter();
    } finally {
      dedupeRunning = false;
    }
  }

  function sendDownload(url) {
    if (url.startsWith(SVG_DATA_PREFIX)) {
      browser.runtime.sendMessage({
        action: 'download_svg',
        markup: decodeURIComponent(url.slice(SVG_DATA_PREFIX.length))
      });
    } else {
      browser.runtime.sendMessage({ action: 'download_image', url });
    }
  }

  // DOM refs
  const loadingEl = document.getElementById('loading');
  const emptyEl = document.getElementById('empty');
  const errorEl = document.getElementById('error');
  const gridEl = document.getElementById('grid');
  const videoHeaderEl = document.getElementById('video-header');
  const videoGridEl = document.getElementById('video-grid');
  const hiddenCountEl = document.getElementById('hidden-count');
  const barEl = document.getElementById('bar');
  const counterEl = document.getElementById('counter');
  const btnSelected = document.getElementById('btn-selected');
  const btnAll = document.getElementById('btn-all');

  // i18n
  document.documentElement.lang = browser.i18n.getUILanguage();

  document.getElementById('loading-text').textContent =
    browser.i18n.getMessage('popupLoading');
  document.getElementById('empty-text').textContent =
    browser.i18n.getMessage('popupNoMedia');
  document.getElementById('empty-hint').textContent =
    browser.i18n.getMessage('popupEmptyHint');
  document.getElementById('error-text').textContent =
    browser.i18n.getMessage('popupReload');
  document.getElementById('video-header-text').textContent =
    browser.i18n.getMessage('popupVideos');
  btnSelected.textContent =
    browser.i18n.getMessage('popupDownloadSelected');
  btnAll.textContent =
    browser.i18n.getMessage('popupDownloadAll');
  document.documentElement.lang = browser.i18n.getUILanguage();
  document.title = browser.i18n.getMessage('buttonTip');

  function show(el) { el.classList.add('visible'); }
  function hide(el) { el.classList.remove('visible'); }

  function updateCounter() {
    const n = selectedUrls.size;
    const total = allUrls.size;
    const hiddenCount = imageEntries.filter(e => e.cell.hidden).length;

    counterEl.textContent = n > 0
      ? `${n} ${browser.i18n.getMessage('popupSelected')}`
      : '';
    btnSelected.disabled = n === 0;
    btnSelected.textContent = `${browser.i18n.getMessage('popupDownloadSelected')} (${n})`;
    btnAll.textContent = `${browser.i18n.getMessage('popupDownloadAll')} (${total})`;

    if (hiddenCount > 0) {
      hiddenCountEl.textContent = browser.i18n.getMessage('popupHiddenCount', [hiddenCount.toString()]);
      show(hiddenCountEl);
    } else {
      hide(hiddenCountEl);
    }
  }

  function flashCell(cell) {
    const flash = cell.querySelector('.flash');
    show(flash);
    setTimeout(() => hide(flash), 400);
  }

  function filenameFromUrl(url, full = false) {
    try {
      const path = new URL(url).pathname;
      const name = path.split('/').pop();
      return (!full && name.length > 20) ? name.slice(0, 17) + '...' : name;
    } catch {
      return '';
    }
  }

  function createPlayIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'white');
    svg.setAttribute('aria-hidden', 'true');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '6,3 20,12 6,21');
    svg.appendChild(poly);
    return svg;
  }

  function createMediaCell(item) {
    const cell = document.createElement('li');
    cell.className = 'cell';
    cell.setAttribute('role', 'listitem');

    const isVideo = item.type === 'video';
    const media = document.createElement(isVideo ? 'video' : 'img');
    media.src = item.url;

    if (isVideo) {
      media.preload = 'metadata';
      media.muted = true;
    } else {
      media.loading = 'lazy';
      media.alt = '';
    }

    media.onerror = () => {
      media.remove();
      const ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.textContent = filenameFromUrl(item.url);
      cell.prepend(ph);
    };

    if (isVideo) {
      const playOverlay = document.createElement('div');
      playOverlay.className = 'play-overlay';
      playOverlay.appendChild(createPlayIcon());
      cell.append(media, playOverlay);
    } else {
      cell.appendChild(media);
    }

    return cell;
  }

  function wrapCell(cell, item) {
    const fallback = browser.i18n.getMessage('popupMediaFallback');
    const isDerivedSvg = item.url.startsWith(SVG_DATA_PREFIX);
    const filename = isDerivedSvg ? browser.i18n.getMessage('popupInlineSvg') : (filenameFromUrl(item.url) || fallback);
    const fullFilename = isDerivedSvg ? browser.i18n.getMessage('popupInlineSvg') : (filenameFromUrl(item.url, true) || fallback);
    const dimSuffix = item.width && item.height ? ` (${item.width}×${item.height})` : '';

    const actionBtn = document.createElement('button');
    actionBtn.className = 'cell-action';
    const fullDownloadLabel = `${browser.i18n.getMessage('popupDownload')} ${fullFilename}${dimSuffix}`;
    actionBtn.setAttribute('aria-label', fullDownloadLabel);
    actionBtn.title = fullDownloadLabel;

    const check = document.createElement('button');
    check.className = 'check';
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', 'false');
    const fullSelectLabel = `${browser.i18n.getMessage('popupSelect')} ${fullFilename}${dimSuffix}`;
    check.setAttribute('aria-label', fullSelectLabel);
    check.title = fullSelectLabel;

    const flash = document.createElement('div');
    flash.className = 'flash';
    flash.setAttribute('aria-hidden', 'true');

    function toggleCheck(e) {
      e.stopPropagation();
      if (selectedUrls.has(item.url)) {
        selectedUrls.delete(item.url);
        check.classList.remove('selected');
        check.setAttribute('aria-checked', 'false');
      } else {
        selectedUrls.add(item.url);
        check.classList.add('selected');
        check.setAttribute('aria-checked', 'true');
      }
      updateCounter();
    }

    check.addEventListener('click', toggleCheck);

    function downloadCell() {
      sendDownload(item.url);
      flashCell(cell);
    }

    actionBtn.addEventListener('click', downloadCell);

    cell.append(actionBtn, check, flash);
    
    if (isDerivedSvg) {
      const badge = document.createElement('span');
      badge.className = 'badge-derived';
      badge.textContent = browser.i18n.getMessage('popupDerivedBadgeText');
      badge.setAttribute('role', 'img');
      badge.setAttribute('aria-label', browser.i18n.getMessage('popupDerivedBadge'));
      cell.append(badge);
    }
    
    return cell;
  }

  function addMedia(items) {
    const videoFragment = document.createDocumentFragment();
    const imageFragment = document.createDocumentFragment();
    let hasVideo = false;
    let hasImage = false;

    for (const item of items) {
      if (allUrls.has(item.url)) continue;
      allUrls.add(item.url);

      const cell = createMediaCell(item);
      wrapCell(cell, item);

      if (item.type === 'video') {
        videoFragment.appendChild(cell);
        hasVideo = true;
      } else {
        imageFragment.appendChild(cell);
        imageEntries.push({ url: item.url, width: item.width, height: item.height, cell });
        hasImage = true;
      }
    }

    if (hasVideo) {
      videoGridEl.appendChild(videoFragment);
      show(videoHeaderEl);
      show(videoGridEl);
    }

    if (hasImage) {
      gridEl.appendChild(imageFragment);
      show(gridEl);
      scheduleDedupe();
    }

    if (allUrls.size > 0) {
      hide(loadingEl);
      hide(emptyEl);
      show(barEl);
      updateCounter();
    }
  }

  function downloadAndClose(urls) {
    // Derived SVGs go through download_svg individually; the rest in bulk
    const svgUrls = urls.filter((u) => u.startsWith(SVG_DATA_PREFIX));
    const fetchable = urls.filter((u) => !u.startsWith(SVG_DATA_PREFIX));
    for (const u of svgUrls) sendDownload(u);
    if (fetchable.length > 0) {
      browser.runtime.sendMessage({ action: 'download_images_bulk', urls: fetchable });
    }
    window.close();
  }

  btnSelected.addEventListener('click', () => {
    downloadAndClose([...selectedUrls]);
  });

  btnAll.addEventListener('click', () => {
    downloadAndClose([...allUrls]);
  });

  // Connect to content script via port for live updates
  async function init() {
    try {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const port = browser.tabs.connect(tab.id, { name: 'imgsnag-popup' });

      port.onMessage.addListener((message) => {
        if (message.action === 'init') {
          hide(loadingEl);
          if (message.images.length === 0) {
            show(emptyEl);
          } else {
            addMedia(message.images);
          }
        } else if (message.action === 'new_images') {
          hide(emptyEl);
          addMedia(message.images);
        }
      });

      port.onDisconnect.addListener(() => {
        if (allUrls.size === 0 && loadingEl.classList.contains('visible')) {
          hide(loadingEl);
          show(errorEl);
        }
      });
    } catch {
      hide(loadingEl);
      show(errorEl);
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { hammingDistance, pickDuplicateUrls };
  }
})();
