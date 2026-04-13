// imgsnag — Content Script

(function () {
  'use strict';

  // Constants

  const IMAGE_EXT_RE = /\.(?:jpe?g|gif|png|webp|svg|avif)(?:[?#]|$)/i;

  // Catches image URLs embedded in inline scripts or JSON-LD that DOM queries miss
  const IMAGE_URL_RE =
    /https?:\/\/[^\s"'<>]+\.(?:jpe?g|gif|png|webp|svg|avif)(?:\?[^\s"'<>]*)?/gi;

  const BG_IMAGE_SELECTORS =
    'div, span, section, article, header, footer, a, li, figure, i, [style*="background"]';

  const MIN_IMAGE_SIZE = 200;

  // Persistent image store — survives DOM removal (infinite scroll recycling)
  const discoveredImages = new Map();
  let popupPort = null;
  let isDragDisabled = false;

  // Helpers

  function sendToBackground(message) {
    browser.runtime.sendMessage(message).catch(() => {});
  }

  function resolveUrl(url) {
    if (!url) return null;
    try {
      return new URL(url, location.href).href;
    } catch {
      return null;
    }
  }

  function isImageUrl(url) {
    if (!url) return false;
    if (url.startsWith('data:image/')) return true;
    try {
      return IMAGE_EXT_RE.test(new URL(url).pathname);
    } catch {
      return false;
    }
  }

  function isSvgUrl(url) {
    try {
      return /\.svg(?:[?#]|$)/i.test(new URL(url).pathname);
    } catch {
      return false;
    }
  }

  function extractBgImageUrls(bgValue) {
    const urls = [];
    const re = /url\(["']?(.*?)["']?\)/gi;
    let match;
    while ((match = re.exec(bgValue)) !== null) {
      urls.push(match[1]);
    }
    return urls;
  }

  function parseSrcset(srcset) {
    if (!srcset) return [];
    return srcset
      .split(',')
      .map((entry) => entry.trim().split(/\s+/)[0])
      .filter(Boolean);
  }

  // Image discovery — scans the DOM for downloadable image URLs

  function collectImageUrls() {
    const uniqueUrls = new Set();

    function trackUrl(url) {
      const resolved = resolveUrl(url);
      if (resolved && !resolved.startsWith('data:') && !uniqueUrls.has(resolved)) {
        uniqueUrls.add(resolved);
      }
    }

    document.querySelectorAll('img[src]').forEach((img) => {
      trackUrl(img.src);
    });

    document.querySelectorAll('[srcset]').forEach((el) => {
      for (const url of parseSrcset(el.getAttribute('srcset'))) {
        trackUrl(url);
      }
    });

    document.querySelectorAll('picture source').forEach((source) => {
      const src = source.getAttribute('src');
      if (src) trackUrl(src);
      for (const url of parseSrcset(source.getAttribute('srcset'))) {
        trackUrl(url);
      }
    });

    document.querySelectorAll('video[poster]').forEach((video) => {
      trackUrl(video.getAttribute('poster'));
    });

    document.querySelectorAll(BG_IMAGE_SELECTORS).forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        for (const url of extractBgImageUrls(bg)) {
          if (isImageUrl(resolveUrl(url))) {
            trackUrl(url);
          }
        }
      }
    });

    // Regex fallback — strip script/style to reduce noise
    const html = document.body.innerHTML.replace(
      /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
      ''
    );
    let match;
    while ((match = IMAGE_URL_RE.exec(html)) !== null) {
      trackUrl(match[0]);
    }

    return uniqueUrls;
  }

  // Size filter

  function getImageSize(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve(null);
      img.src = url;
    });
  }

  function getDomImageSize(url) {
    const el = document.querySelector(`img[src="${CSS.escape(url)}"]`);
    if (el && el.naturalWidth > 0 && el.naturalHeight > 0) {
      return { width: el.naturalWidth, height: el.naturalHeight };
    }
    return null;
  }

  async function filterImagesBySize(urls) {
    const results = await Promise.all(
      [...urls].map(async (url) => {
        if (isSvgUrl(url)) return url;
        const domSize = getDomImageSize(url);
        const size = domSize || (await getImageSize(url));
        if (size && size.width >= MIN_IMAGE_SIZE && size.height >= MIN_IMAGE_SIZE) return url;
        return null;
      })
    );
    return results.filter(Boolean);
  }

  // Persistent store management

  function notifyPopup(images) {
    if (popupPort && images.length > 0) {
      popupPort.postMessage({ action: 'new_images', images });
    }
  }

  async function addNewUrls(urls) {
    // Filter out already-known URLs
    const unknown = [...urls].filter((url) => !discoveredImages.has(url));
    if (unknown.length === 0) return;

    const filtered = await filterImagesBySize(new Set(unknown));
    const images = filtered.map((url) => {
      const size = getDomImageSize(url);
      return { url, width: size?.width || 0, height: size?.height || 0 };
    });

    const added = [];
    for (const img of images) {
      if (!discoveredImages.has(img.url)) {
        discoveredImages.set(img.url, img);
        added.push(img);
      }
    }
    notifyPopup(added);
  }

  // Scan a single element for image URLs (used by MutationObserver)

  function extractUrlsFromElement(el, urls) {
    if (el.tagName === 'IMG' && el.src) {
      const url = resolveUrl(el.src);
      if (url && !url.startsWith('data:')) urls.add(url);
    }

    if (el.hasAttribute && el.hasAttribute('srcset')) {
      for (const raw of parseSrcset(el.getAttribute('srcset'))) {
        const url = resolveUrl(raw);
        if (url && !url.startsWith('data:')) urls.add(url);
      }
    }

    if (el.tagName === 'VIDEO' && el.hasAttribute('poster')) {
      const url = resolveUrl(el.getAttribute('poster'));
      if (url && !url.startsWith('data:')) urls.add(url);
    }

    try {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        for (const raw of extractBgImageUrls(bg)) {
          const url = resolveUrl(raw);
          if (url && isImageUrl(url) && !url.startsWith('data:')) urls.add(url);
        }
      }
    } catch {
      // Element may not be connected to DOM yet
    }
  }

  // Observers — continuous image tracking

  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      const urls = new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          extractUrlsFromElement(node, urls);
          if (node.querySelectorAll) {
            const sel = 'img, [srcset], picture source, video[poster], ' + BG_IMAGE_SELECTORS;
            node.querySelectorAll(sel).forEach((el) => extractUrlsFromElement(el, urls));
          }
        }
      }
      if (urls.size > 0) addNewUrls(urls);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setupPerformanceObserver() {
    try {
      const observer = new PerformanceObserver((list) => {
        const urls = new Set();
        for (const entry of list.getEntries()) {
          if (entry.initiatorType === 'img' || IMAGE_EXT_RE.test(entry.name)) {
            const url = resolveUrl(entry.name);
            if (url && !url.startsWith('data:') && !discoveredImages.has(url)) {
              urls.add(url);
            }
          }
        }
        if (urls.size > 0) addNewUrls(urls);
      });
      // buffered: true delivers historical entries from before the observer was created
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      // PerformanceObserver not supported — graceful fallback
    }
  }

  // Popup port connection

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'imgsnag-popup') return;
    popupPort = port;
    port.postMessage({ action: 'init', images: [...discoveredImages.values()] });
    port.onDisconnect.addListener(() => {
      popupPort = null;
    });
  });

  // Initial scan — populate the store with what's on the page now

  async function initialScan() {
    const urls = collectImageUrls();
    await addNewUrls(urls);
    setupMutationObserver();
    setupPerformanceObserver();
  }

  initialScan();

  // Alt+Click — downloads the image(s) stacked under the cursor

  function downloadImagesAtPoint(e) {
    const elements = document.elementsFromPoint(e.clientX, e.clientY);
    const downloadedUrls = new Set();
    let didDownload = false;

    for (const el of elements) {
      if (el.tagName === 'IMG' && el.src) {
        const url = resolveUrl(el.src);
        if (url && !url.startsWith('data:') && !downloadedUrls.has(url)) {
          downloadedUrls.add(url);
          sendToBackground({ action: 'download_image', url });
          didDownload = true;
        }
        continue;
      }

      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        for (const raw of extractBgImageUrls(bg)) {
          const url = resolveUrl(raw);
          if (url && isImageUrl(url) && !url.startsWith('data:') && !downloadedUrls.has(url)) {
            downloadedUrls.add(url);
            sendToBackground({ action: 'download_image', url });
            didDownload = true;
          }
        }
      }
    }

    if (didDownload) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  document.addEventListener('click', (e) => {
    if (e.altKey) {
      downloadImagesAtPoint(e);
    }
  });

  // Drag-to-save (can be disabled in options)
  document.addEventListener('dragend', (e) => {
    if (e.target.tagName === 'IMG' && !isDragDisabled) {
      const url = resolveUrl(e.target.src);
      if (url) {
        sendToBackground({ action: 'download_image', url });
      }
    }
  });

  function syncDragPreference() {
    browser.storage.sync.get({ disableDrag: false }).then((items) => {
      isDragDisabled = items.disableDrag;
    });
  }

  syncDragPreference();
  browser.storage.onChanged.addListener(() => syncDragPreference());
})();
