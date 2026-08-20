// imgsnag — Popup

(function () {
  'use strict';

  const selectedUrls = new Set();
  const allUrls = new Set();

  // Derived inline-SVG items carry their markup as a data: URL (RFC #118)
  const SVG_DATA_PREFIX = 'data:image/svg+xml;charset=utf-8,';

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
    counterEl.textContent = n > 0
      ? `${n} ${browser.i18n.getMessage('popupSelected')}`
      : '';
    btnSelected.disabled = n === 0;
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
    const cell = document.createElement('div');
    cell.className = 'cell';

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
    const filename = isDerivedSvg ? 'inline.svg' : (filenameFromUrl(item.url) || fallback);
    const fullFilename = isDerivedSvg ? 'inline.svg' : (filenameFromUrl(item.url, true) || fallback);
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
    }

    if (allUrls.size > 0) {
      hide(loadingEl);
      hide(emptyEl);
      show(barEl);
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
})();
