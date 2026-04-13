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
  const barEl = document.getElementById('bar');
  const counterEl = document.getElementById('counter');
  const btnSelected = document.getElementById('btn-selected');
  const btnAll = document.getElementById('btn-all');

  // i18n
  document.getElementById('loading-text').textContent =
    browser.i18n.getMessage('popupLoading');
  document.getElementById('empty-text').textContent =
    browser.i18n.getMessage('popupNoImages');
  document.getElementById('error-text').textContent =
    browser.i18n.getMessage('popupReload');
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

  function createCell(img) {
    const cell = document.createElement('div');
    cell.className = 'cell';

    const thumb = document.createElement('img');
    thumb.src = img.url;
    thumb.loading = 'lazy';
    thumb.onerror = () => {
      thumb.remove();
      const ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.textContent = filenameFromUrl(img.url);
      cell.prepend(ph);
    };

    const check = document.createElement('div');
    check.className = 'check';

    const flash = document.createElement('div');
    flash.className = 'flash';

    check.addEventListener('click', (e) => {
      e.stopPropagation();
      if (selectedUrls.has(img.url)) {
        selectedUrls.delete(img.url);
        check.classList.remove('selected');
      } else {
        selectedUrls.add(img.url);
        check.classList.add('selected');
      }
      updateCounter();
    });

    cell.addEventListener('click', () => {
      browser.runtime.sendMessage({ action: 'download_image', url: img.url });
      flashCell(cell);
    });

    cell.append(thumb, check, flash);
    return cell;
  }

  function addImages(images) {
    for (const img of images) {
      if (allUrls.has(img.url)) continue;
      allUrls.add(img.url);
      gridEl.appendChild(createCell(img));
    }

    // Update visibility based on whether we have images
    if (allUrls.size > 0) {
      hide(loadingEl);
      hide(emptyEl);
      show(gridEl);
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
            addImages(message.images);
          }
        } else if (message.action === 'new_images') {
          hide(emptyEl);
          addImages(message.images);
        }
      });

      port.onDisconnect.addListener(() => {
        // Content script gone — if still loading, show error
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
