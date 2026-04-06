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

  // State

  let isDragDisabled = false;
  let isDownloading = false;
  let downloadController = null;

  // Helpers

  // Service worker can terminate at any time in MV3
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

  // Image discovery — scans the page for downloadable image URLs

  function collectImageUrls() {
    const uniqueUrls = new Set();

    function trackUrl(url) {
      const resolved = resolveUrl(url);
      if (resolved && !resolved.startsWith('data:') && !uniqueUrls.has(resolved)) {
        uniqueUrls.add(resolved);
      }
    }

    // <img src>
    document.querySelectorAll('img[src]').forEach((img) => {
      trackUrl(img.src);
    });

    // srcset attributes (img, source, etc.)
    document.querySelectorAll('[srcset]').forEach((el) => {
      for (const url of parseSrcset(el.getAttribute('srcset'))) {
        trackUrl(url);
      }
    });

    // <picture> <source> elements
    document.querySelectorAll('picture source').forEach((source) => {
      const src = source.getAttribute('src');
      if (src) trackUrl(src);
      for (const url of parseSrcset(source.getAttribute('srcset'))) {
        trackUrl(url);
      }
    });

    // <video poster>
    document.querySelectorAll('video[poster]').forEach((video) => {
      trackUrl(video.getAttribute('poster'));
    });

    // CSS background-image on likely container elements
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

    // Fallback: regex sweep of innerHTML for URLs the DOM queries missed
    // Strip script/style content first to avoid tracking pixels, sprite URLs, etc.
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

  // Size filter — skips icons/thumbnails, SVGs always pass (resolution-independent)

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

  // Download orchestration

  async function downloadImages(urls) {
    isDownloading = true;
    downloadController = new AbortController();
    const signal = downloadController.signal;
    const total = urls.length;

    for (let i = 0; i < urls.length; i++) {
      if (signal.aborted) break;
      sendToBackground({
        action: 'update_badge',
        text: `${i + 1}/${total}`,
        inProgress: true,
      });
      try {
        await browser.runtime.sendMessage({ action: 'download_image', url: urls[i] });
      } catch {
        // Non-fatal — skip and continue with next image
      }
    }

    isDownloading = false;
    downloadController = null;

    sendToBackground({ action: 'update_badge', text: '' });
  }

  function abortDownloads() {
    if (downloadController) {
      downloadController.abort();
    }
    isDownloading = false;
    downloadController = null;

    sendToBackground({ action: 'cancel_downloads' });
    sendToBackground({ action: 'update_badge', text: '' });
  }

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

  // Event listeners

  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.action === 'search_images') {
      const imageUrls = collectImageUrls();
      filterImagesBySize(imageUrls).then((filtered) => {
        if (filtered.length > 0) {
          downloadImages(filtered);
        }
        sendToBackground({
          action: 'update_badge',
          text: String(filtered.length),
        });
      });
      sendResponse({ imageUrls: [...imageUrls] });
    } else if (message.action === 'stop_downloads') {
      abortDownloads();
      sendResponse({});
    }
  });

  // Alt+Click to save individual images
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

  // Clear stale badge from a previous session
  sendToBackground({ action: 'update_badge', text: '' });
})();
