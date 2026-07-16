// imgsnag — Content Script

(function () {
  'use strict';

  // Constants

  const IMAGE_EXT_RE = /\.(?:jpe?g|gif|png|webp|svg|avif)(?:[?#]|$)/i;
  const VIDEO_EXT_RE = /\.(?:mp4|webm|ogv|mov|m4v|avi)(?:[?#]|$)/i;

  // Catches image URLs embedded in inline scripts or JSON-LD that DOM queries miss
  const IMAGE_URL_RE =
    /https?:\/\/[^\s"'<>]+\.(?:jpe?g|gif|png|webp|svg|avif)(?:\?[^\s"'<>]*)?/gi;

  const BG_IMAGE_SELECTORS =
    'div, span, section, article, header, footer, a, li, figure, i, [style*="background"]';

  const MIN_IMAGE_SIZE = 200;

  // Persistent media store — survives DOM removal (infinite scroll recycling)
  const discoveredMedia = new Map();
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

  function isVideoUrl(url) {
    if (!url) return false;
    try {
      return VIDEO_EXT_RE.test(new URL(url).pathname);
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

  // Media discovery — scans the DOM for downloadable image and video URLs

  function collectMediaUrls() {
    const imageUrls = new Set();
    const videoUrls = new Set();

    function trackImage(url) {
      const resolved = resolveUrl(url);
      if (resolved && !resolved.startsWith('data:') && !imageUrls.has(resolved)) {
        imageUrls.add(resolved);
      }
    }

    function trackVideo(url) {
      const resolved = resolveUrl(url);
      if (resolved && !resolved.startsWith('data:') && !videoUrls.has(resolved)) {
        videoUrls.add(resolved);
      }
    }

    // <img src> and lazy loaded variants
    document.querySelectorAll('img[src], img[data-src], img[data-lazy-src], img[data-original]').forEach((img) => {
      if (img.src) trackImage(img.src);
      if (img.hasAttribute('data-src')) trackImage(img.getAttribute('data-src'));
      if (img.hasAttribute('data-lazy-src')) trackImage(img.getAttribute('data-lazy-src'));
      if (img.hasAttribute('data-original')) trackImage(img.getAttribute('data-original'));
    });

    // srcset attributes (img, source, etc.) and lazy loaded variants
    document.querySelectorAll('[srcset], [data-srcset]').forEach((el) => {
      if (el.hasAttribute('srcset')) {
        for (const url of parseSrcset(el.getAttribute('srcset'))) {
          trackImage(url);
        }
      }
      if (el.hasAttribute('data-srcset')) {
        for (const url of parseSrcset(el.getAttribute('data-srcset'))) {
          trackImage(url);
        }
      }
    });

    // <picture> <source> elements
    document.querySelectorAll('picture source').forEach((source) => {
      if (source.hasAttribute('src')) trackImage(source.getAttribute('src'));
      if (source.hasAttribute('data-src')) trackImage(source.getAttribute('data-src'));
      if (source.hasAttribute('data-lazy-src')) trackImage(source.getAttribute('data-lazy-src'));
      if (source.hasAttribute('data-original')) trackImage(source.getAttribute('data-original'));
      if (source.hasAttribute('srcset')) {
        for (const url of parseSrcset(source.getAttribute('srcset'))) {
          trackImage(url);
        }
      }
      if (source.hasAttribute('data-srcset')) {
        for (const url of parseSrcset(source.getAttribute('data-srcset'))) {
          trackImage(url);
        }
      }
    });

    // <video poster> (still an image)
    document.querySelectorAll('video[poster]').forEach((video) => {
      trackImage(video.getAttribute('poster'));
    });

    // <video src> and <video><source src>
    document.querySelectorAll('video[src]').forEach((video) => {
      trackVideo(video.src);
    });
    document.querySelectorAll('video source[src]').forEach((source) => {
      trackVideo(source.src);
    });

    // CSS background-image on likely container elements
    document.querySelectorAll(BG_IMAGE_SELECTORS).forEach((el) => {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        for (const url of extractBgImageUrls(bg)) {
          if (isImageUrl(resolveUrl(url))) {
            trackImage(url);
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
      trackImage(match[0]);
    }

    return { imageUrls, videoUrls };
  }

  // Size filter — only for images, videos skip this

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

  function notifyPopup(items) {
    if (popupPort && items.length > 0) {
      popupPort.postMessage({ action: 'new_images', images: items });
    }
  }

  async function addNewUrls(urls, type) {
    const unknown = [...urls].filter((url) => !discoveredMedia.has(url));
    if (unknown.length === 0) return;

    let accepted;
    if (type === 'video') {
      // Videos skip size filtering — can't measure with new Image()
      accepted = unknown;
    } else {
      accepted = await filterImagesBySize(new Set(unknown));
    }

    const items = accepted.map((url) => {
      const size = type === 'image' ? getDomImageSize(url) : null;
      return { url, type, width: size?.width || 0, height: size?.height || 0 };
    });

    const added = [];
    for (const item of items) {
      if (!discoveredMedia.has(item.url)) {
        discoveredMedia.set(item.url, item);
        added.push(item);
      }
    }
    notifyPopup(added);
  }

  // Scan a single element for media URLs (used by MutationObserver)

  function extractUrlsFromElement(el, imageSet, videoSet) {
    if (el.tagName === 'IMG') {
      const attrs = ['src', 'data-src', 'data-lazy-src', 'data-original'];
      for (const attr of attrs) {
        let val;
        if (attr === 'src') val = el.src;
        else val = el.hasAttribute(attr) ? el.getAttribute(attr) : null;
        if (val) {
          const url = resolveUrl(val);
          if (url && !url.startsWith('data:')) imageSet.add(url);
        }
      }
    }

    if (el.hasAttribute) {
      if (el.hasAttribute('srcset')) {
        for (const raw of parseSrcset(el.getAttribute('srcset'))) {
          const url = resolveUrl(raw);
          if (url && !url.startsWith('data:')) imageSet.add(url);
        }
      }
      if (el.hasAttribute('data-srcset')) {
        for (const raw of parseSrcset(el.getAttribute('data-srcset'))) {
          const url = resolveUrl(raw);
          if (url && !url.startsWith('data:')) imageSet.add(url);
        }
      }
    }

    if (el.tagName === 'VIDEO') {
      if (el.src) {
        const url = resolveUrl(el.src);
        if (url && !url.startsWith('data:')) videoSet.add(url);
      }
      if (el.hasAttribute('poster')) {
        const url = resolveUrl(el.getAttribute('poster'));
        if (url && !url.startsWith('data:')) imageSet.add(url);
      }
    }

    if (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'VIDEO') {
      const url = resolveUrl(el.src);
      if (url && !url.startsWith('data:')) videoSet.add(url);
    }

    try {
      const bg = getComputedStyle(el).backgroundImage;
      if (bg && bg !== 'none') {
        for (const raw of extractBgImageUrls(bg)) {
          const url = resolveUrl(raw);
          if (url && isImageUrl(url) && !url.startsWith('data:')) imageSet.add(url);
        }
      }
    } catch {
      // Element may not be connected to DOM yet
    }
  }

  // Observers — continuous media tracking

  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      const imageUrls = new Set();
      const videoUrls = new Set();
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          extractUrlsFromElement(node, imageUrls, videoUrls);
          if (node.querySelectorAll) {
            const sel = 'img, [srcset], [data-srcset], picture source, video, video source, ' + BG_IMAGE_SELECTORS;
            node.querySelectorAll(sel).forEach((el) => extractUrlsFromElement(el, imageUrls, videoUrls));
          }
        }
      }
      if (imageUrls.size > 0) addNewUrls(imageUrls, 'image');
      if (videoUrls.size > 0) addNewUrls(videoUrls, 'video');
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function setupPerformanceObserver() {
    try {
      const observer = new PerformanceObserver((list) => {
        const imageUrls = new Set();
        const videoUrls = new Set();
        for (const entry of list.getEntries()) {
          const url = resolveUrl(entry.name);
          if (!url || url.startsWith('data:') || discoveredMedia.has(url)) continue;

          if (isVideoUrl(url) || entry.initiatorType === 'video') {
            videoUrls.add(url);
          } else if (IMAGE_EXT_RE.test(entry.name) || entry.initiatorType === 'img') {
            imageUrls.add(url);
          }
        }
        if (imageUrls.size > 0) addNewUrls(imageUrls, 'image');
        if (videoUrls.size > 0) addNewUrls(videoUrls, 'video');
      });
      observer.observe({ type: 'resource', buffered: true });
    } catch {
      // PerformanceObserver not supported
    }
  }

  // Popup port connection

  browser.runtime.onConnect.addListener((port) => {
    if (port.name !== 'imgsnag-popup') return;
    popupPort = port;
    port.postMessage({ action: 'init', images: [...discoveredMedia.values()] });
    port.onDisconnect.addListener(() => {
      popupPort = null;
    });
  });

  // Initial scan

  async function initialScan() {
    const { imageUrls, videoUrls } = collectMediaUrls();
    await addNewUrls(imageUrls, 'image');
    await addNewUrls(videoUrls, 'video');
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
      if (el.tagName === 'IMG') {
        let hasValidImage = false;
        const attrs = ['data-src', 'data-lazy-src', 'data-original', 'src'];
        for (const attr of attrs) {
          let val;
          if (attr === 'src') val = el.src;
          else val = el.hasAttribute(attr) ? el.getAttribute(attr) : null;
          if (val) {
            const url = resolveUrl(val);
            if (url && !url.startsWith('data:')) {
              hasValidImage = true;
              if (!downloadedUrls.has(url)) {
                downloadedUrls.add(url);
                sendToBackground({ action: 'download_image', url });
                didDownload = true;
              }
              break; // Stop after first valid attribute (whether downloaded or already cached)
            }
          }
        }
        if (hasValidImage) {
          continue;
        }
      }

      if (el.tagName === 'VIDEO') {
        const url = resolveUrl(el.src || el.querySelector('source')?.src);
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
      const attrs = ['data-src', 'data-lazy-src', 'data-original', 'src'];
      for (const attr of attrs) {
        let val;
        if (attr === 'src') val = e.target.src;
        else val = e.target.hasAttribute(attr) ? e.target.getAttribute(attr) : null;
        if (val) {
          const url = resolveUrl(val);
          if (url && !url.startsWith('data:')) {
            sendToBackground({ action: 'download_image', url });
            break; // Only trigger one download
          }
        }
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
