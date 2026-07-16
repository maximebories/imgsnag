// imgsnag — Popup

(function () {
  'use strict';

  const selectedUrls = new Set();
  const allUrls = new Set();

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

  function filenameFromUrl(url) {
    try {
      const path = new URL(url).pathname;
      const name = path.split('/').pop();
      return name.length > 20 ? name.slice(0, 17) + '...' : name;
    } catch {
      return '';
    }
  }

  function createPlayIcon() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'white');
    const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', '6,3 20,12 6,21');
    svg.appendChild(poly);
    return svg;
  }

  function createImageCell(item) {
    const cell = document.createElement('div');
    cell.className = 'cell';

    const thumb = document.createElement('img');
    thumb.src = item.url;
    thumb.loading = 'lazy';
    thumb.onerror = () => {
      thumb.remove();
      const ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.textContent = filenameFromUrl(item.url);
      cell.prepend(ph);
    };

    cell.appendChild(thumb);
    return cell;
  }

  function createVideoCell(item) {
    const cell = document.createElement('div');
    cell.className = 'cell';

    const video = document.createElement('video');
    video.src = item.url;
    video.preload = 'metadata';
    video.muted = true;
    video.onerror = () => {
      video.remove();
      const ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.textContent = filenameFromUrl(item.url);
      cell.prepend(ph);
    };

    const playOverlay = document.createElement('div');
    playOverlay.className = 'play-overlay';
    playOverlay.appendChild(createPlayIcon());

    cell.append(video, playOverlay);
    return cell;
  }

  function wrapCell(cell, item) {
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.setAttribute('aria-label', browser.i18n.getMessage('popupDownload'));

    const check = document.createElement('div');
    check.className = 'check';
    check.tabIndex = 0;
    check.setAttribute('role', 'checkbox');
    check.setAttribute('aria-checked', 'false');
    check.setAttribute('aria-label', browser.i18n.getMessage('popupSelect'));

    const flash = document.createElement('div');
    flash.className = 'flash';

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
    check.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleCheck(e);
      }
    });

    function downloadCell() {
      browser.runtime.sendMessage({ action: 'download_image', url: item.url });
      flashCell(cell);
    }

    cell.addEventListener('click', downloadCell);
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        downloadCell();
      }
    });

    cell.append(check, flash);
    return cell;
  }

  function addMedia(items) {
    for (const item of items) {
      if (allUrls.has(item.url)) continue;
      allUrls.add(item.url);

      const cell = item.type === 'video'
        ? createVideoCell(item)
        : createImageCell(item);
      wrapCell(cell, item);

      if (item.type === 'video') {
        videoGridEl.appendChild(cell);
        show(videoHeaderEl);
        show(videoGridEl);
      } else {
        gridEl.appendChild(cell);
        show(gridEl);
      }
    }

    if (allUrls.size > 0) {
      hide(loadingEl);
      hide(emptyEl);
      show(barEl);
    }
  }

  function downloadAndClose(urls) {
    browser.runtime.sendMessage({ action: 'download_images_bulk', urls });
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
