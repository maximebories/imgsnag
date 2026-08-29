// imgsnag — Content Script

(function () {
  'use strict';

  // Constants

  const IMAGE_EXT_RE = /\.(?:jpe?g|gif|png|webp|svg|avif)(?:[?#]|$)/i;
  const VIDEO_EXT_RE = /\.(?:mp4|webm|ogv|mov|m4v|avi)(?:[?#]|$)/i;
  const BG_URL_RE = /url\(["']?(.*?)["']?\)/gi;
  const IMAGE_SET_RE = /(?:-webkit-)?image-set\(([^)]+)\)/gi;

  // Catches image URLs embedded in inline scripts or JSON-LD that DOM queries miss
  const IMAGE_URL_RE =
    /https?:(?:\\?\/){2}[^\s"'<>]+\.(?:jpe?g|gif|png|webp|svg|avif)(?:\?[^\s"'<>]*)?/gi;

  // Cheap pre-check before the expensive URL sweep. Case-insensitive because
  // IMAGE_URL_RE is: a literal includes('http') check would miss "HtTp://".
  const HTTP_HINT_RE = /http/i;

  const BG_IMAGE_SELECTORS =
    'div, span, section, article, header, footer, a, li, figure, i, [style*="background"]';

  const MIN_IMAGE_SIZE = 200;
  // Tags worth an attribute sweep when they turn up in a MutationObserver batch
  const TAG_SET = new Set(['IMG', 'VIDEO', 'SOURCE', 'PICTURE', 'DIV', 'SPAN', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'A', 'LI', 'FIGURE', 'I', 'META', 'LINK', 'OBJECT', 'EMBED', 'IFRAME', 'image', 'IMAGE']);

  // Inline-SVG capture (derived files, RFC #118 stage 1)
  const SVG_DATA_PREFIX = 'data:image/svg+xml;charset=utf-8,';
  const MAX_INLINE_SVG_CHARS = 2 * 1024 * 1024;

  // Persistent media store — survives DOM removal (infinite scroll recycling)
  const discoveredMedia = new Map();
  let popupPort = null;
  let isDragDisabled = false;

  // Background image lazy evaluation queue (Feather: getComputedStyle batched at idle)
  const pendingBackgroundCheckQueue = [];
  let isBgCheckScheduled = false;

  // Helpers

  function sendToBackground(message) {
    browser.runtime.sendMessage(message).catch(() => {});
  }

  function resolveUrl(url) {
    if (!url) return null;
    try {
      const parsed = new URL(url, location.href);
      // Warden: Restrict to safe protocols to prevent exfiltration / local file access
      const p = parsed.protocol;
      if (p !== 'http:' && p !== 'https:' && p !== 'blob:' && p !== 'data:') {
        return null;
      }
      return parsed.href;
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
    BG_URL_RE.lastIndex = 0;
    let match;
    while ((match = BG_URL_RE.exec(bgValue)) !== null) {
      urls.push(match[1]);
    }

    IMAGE_SET_RE.lastIndex = 0;
    let setMatch;
    while ((setMatch = IMAGE_SET_RE.exec(bgValue)) !== null) {
      const inner = setMatch[1];
      const entries = inner.split(',');
      for (const entry of entries) {
        const trimmed = entry.trim();
        if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
          const quote = trimmed[0];
          const endQuote = trimmed.indexOf(quote, 1);
          if (endQuote !== -1) {
            urls.push(trimmed.substring(1, endQuote));
          }
        }
      }
    }
    return urls;
  }

  function getCssMediaUrls(el, useDisplayAccurate = false) {
    const urls = [];
    try {
      const rawStyle = el.getAttribute('style') || '';
      const hasExternalStyling = el.className || el.id;
      const hasInlineMaskOrContent = rawStyle.includes('mask') || rawStyle.includes('content');

      const canSkipComputed = !useDisplayAccurate && !hasExternalStyling && !hasInlineMaskOrContent;

      const styles = [];
      if (canSkipComputed) {
        styles.push(el.style);
      } else {
        styles.push(getComputedStyle(el));
        try { styles.push(getComputedStyle(el, '::before')); } catch {}
        try { styles.push(getComputedStyle(el, '::after')); } catch {}
      }

      let isMainElement = true;
      for (const style of styles) {
        if (!style) continue;

        let bgImage = style.backgroundImage;
        if (isMainElement && !useDisplayAccurate && !canSkipComputed && el.style && el.style.backgroundImage) {
          const inlineBg = el.style.backgroundImage;
          if (inlineBg && inlineBg !== 'none' && inlineBg !== 'normal') {
             bgImage = inlineBg;
          }
        }

        const props = [
          bgImage,
          style.maskImage || style.getPropertyValue('mask-image'),
          style.webkitMaskImage || style.getPropertyValue('-webkit-mask-image'),
          style.content
        ];
        for (const bg of props) {
          if (bg && bg !== 'none' && bg !== 'normal') {
            for (const raw of extractBgImageUrls(bg)) {
              if (!urls.includes(raw)) urls.push(raw);
            }
          }
        }
        isMainElement = false;
      }
    } catch {
      // Element may not be connected to DOM yet
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

  // A srcset lists the SAME image at several sizes/densities. Tracking every
  // candidate floods the grid with duplicates (one cell per width variant),
  // so pick the single best candidate: highest w or x descriptor.
  function pickBestFromSrcset(srcset) {
    if (!srcset) return null;
    let bestUrl = null;
    let bestScore = -1;
    for (const entry of srcset.split(',')) {
      const parts = entry.trim().split(/\s+/);
      const url = parts[0];
      if (!url) continue;
      let score = 1;
      const d = parts[1];
      if (d) {
        const n = parseFloat(d);
        if (!Number.isNaN(n)) score = /w$/i.test(d) ? n : n * 1000;
      }
      if (score > bestScore) {
        bestScore = score;
        bestUrl = url;
      }
    }
    return bestUrl;
  }

  // Media discovery — scans the DOM for downloadable image and video URLs

  function collectImages(trackImage) {
    // <meta> Open Graph / Twitter and <link rel="preload"> hints
    document.querySelectorAll('meta[property="og:image"], meta[name="twitter:image"], link[rel="preload"][as="image"]').forEach((el) => {
      const url = el.getAttribute('content') || el.getAttribute('href');
      if (url) trackImage(url);
    });

    // <img src> and lazy loaded variants. When the element carries a srcset
    // (or data-srcset), src is just one more variant of the same image — the
    // srcset best-pick below covers it, so skip src to avoid duplicates.
    document.querySelectorAll('img[src], img[data-src], img[data-lazy-src], img[data-original]').forEach((img) => {
      const hasSet = img.hasAttribute('srcset') || img.hasAttribute('data-srcset') || img.parentElement?.tagName === 'PICTURE';
      if (img.src && !hasSet) trackImage(img.src);
      if (img.hasAttribute('data-src')) trackImage(img.getAttribute('data-src'));
      if (img.hasAttribute('data-lazy-src')) trackImage(img.getAttribute('data-lazy-src'));
      if (img.hasAttribute('data-original')) trackImage(img.getAttribute('data-original'));
    });

    // srcset attributes (img, source, etc.) — best candidate only.
    // <picture> sources are handled per-picture below (format alternatives).
    document.querySelectorAll('[srcset], [data-srcset], [data-bgset]').forEach((el) => {
      if (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'PICTURE') return;
      const best = pickBestFromSrcset(el.getAttribute('srcset')) ||
                   pickBestFromSrcset(el.getAttribute('data-srcset')) ||
                   pickBestFromSrcset(el.getAttribute('data-bgset'));
      if (best) trackImage(best);
    });

    document.querySelectorAll('[data-bg], [data-bg-src], [data-background], [data-background-image]').forEach((el) => {
      const attrs = ['data-bg', 'data-bg-src', 'data-background', 'data-background-image'];
      for (const attr of attrs) {
        if (el.hasAttribute(attr)) {
          const bg = el.getAttribute(attr);
          if (bg) {
            if (bg.includes('url(') || bg.includes('image-set(')) {
              for (const raw of extractBgImageUrls(bg)) trackImage(raw);
            } else {
              const url = resolveUrl(bg.trim());
              if (isImageUrl(url)) trackImage(bg.trim());
            }
          }
        }
      }
    });

    // <picture>: every <source> is the SAME image in another format/breakpoint.
    // Prefer the variant the browser actually rendered; otherwise take the
    // best candidate of the first usable source.
    document.querySelectorAll('picture').forEach((pic) => {
      const img = pic.querySelector('img');
      if (img && img.currentSrc) {
        trackImage(img.currentSrc);
        return;
      }
      for (const source of pic.querySelectorAll('source')) {
        const best = pickBestFromSrcset(source.getAttribute('srcset')) ||
                     pickBestFromSrcset(source.getAttribute('data-srcset')) ||
                     source.getAttribute('src') || source.getAttribute('data-src') ||
                     source.getAttribute('data-lazy-src') || source.getAttribute('data-original');
        if (best) { trackImage(best); return; }
      }
    });

    // <video poster> and lazy loaded variants (still an image)
    document.querySelectorAll('video[poster], video[data-poster]').forEach((video) => {
      const poster = video.getAttribute('poster') || video.getAttribute('data-poster');
      if (poster) trackImage(poster);
    });

    // <object>/<embed>/<iframe> whose source is an image file
    document.querySelectorAll('object[data], embed[src], iframe[src]').forEach((el) => {
      const raw = el.tagName === 'OBJECT' ? el.getAttribute('data') : el.getAttribute('src');
      if (isImageUrl(resolveUrl(raw))) trackImage(raw);
    });

    // <svg image> embedded images
    document.querySelectorAll('svg image, image').forEach((el) => {
      const raw = el.getAttribute('href') || el.getAttribute('xlink:href');
      if (raw) trackImage(raw);
    });

    // CSS background-image on likely container elements
    document.querySelectorAll(BG_IMAGE_SELECTORS).forEach((el) => {
      // Fast path: skip elements with no styling hints to avoid expensive getComputedStyle calls
      if (!el.className && !el.id && !el.getAttribute('style')) return;

      pendingBackgroundCheckQueue.push(el);
      if (!isBgCheckScheduled) {
        isBgCheckScheduled = true;
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(processBgImageQueue);
        } else {
          setTimeout(processBgImageQueue, 1);
        }
      }
    });

    // Fallback — scan text and attributes to catch JSON-LD or data attributes that DOM queries miss
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'STYLE') return NodeFilter.FILTER_REJECT;
            if (node.tagName === 'SCRIPT') {
              const type = node.getAttribute('type');
              if (type === 'application/ld+json' || type === 'application/json') {
                return NodeFilter.FILTER_ACCEPT;
              }
              return NodeFilter.FILTER_REJECT;
            }
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue && HTTP_HINT_RE.test(node.nodeValue)) {
          let match;
          while ((match = IMAGE_URL_RE.exec(node.nodeValue)) !== null) {
            let url = match[0];
            if (url.includes('\\')) url = url.replace(/\\/g, '');
            trackImage(url);
          }
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const attrs = node.attributes;
        for (let i = 0, len = attrs.length; i < len; i++) {
          // srcset-family attributes hold many variants of one image; the
          // structural scan already tracked the best candidate
          if (attrs[i].name.includes('srcset')) continue;
          const val = attrs[i].value;
          if (val && HTTP_HINT_RE.test(val)) {
            let match;
            while ((match = IMAGE_URL_RE.exec(val)) !== null) {
              let url = match[0];
              if (url.includes('\\')) url = url.replace(/\\/g, '');
              trackImage(url);
            }
          }
        }
      }
    }
  }

  function collectVideos(trackVideo) {
    // <video src> and lazy loaded variants
    document.querySelectorAll('video[src], video[data-src], video[data-lazy-src], video[data-original]').forEach((video) => {
      const src = video.getAttribute('src') || video.getAttribute('data-src') || video.getAttribute('data-lazy-src') || video.getAttribute('data-original');
      if (src) trackVideo(src);
    });
    // <video><source src> and lazy loaded variants
    document.querySelectorAll('video source[src], video source[data-src], video source[data-lazy-src], video source[data-original]').forEach((source) => {
      const src = source.getAttribute('src') || source.getAttribute('data-src') || source.getAttribute('data-lazy-src') || source.getAttribute('data-original');
      if (src) trackVideo(src);
    });
  }

  // Inline <svg> elements have no URL — serialize them into data: URLs on
  // demand. Only runs when the popup connects (never during ambient
  // discovery) so pages that are never snagged pay nothing.
  function collectInlineSvgs() {
    const items = [];
    document.querySelectorAll('svg').forEach((svg) => {
      if (svg.ownerSVGElement) return; // nested <svg> — captured via its root
      if (svg.querySelector('use')) return; // stage 1: <use> refs serialize empty
      const rect = svg.getBoundingClientRect();
      if (rect.width < MIN_IMAGE_SIZE || rect.height < MIN_IMAGE_SIZE) return;
      let markup;
      try {
        markup = new XMLSerializer().serializeToString(svg);
      } catch {
        return;
      }
      if (!markup || markup.length > MAX_INLINE_SVG_CHARS) return;
      items.push({
        url: SVG_DATA_PREFIX + encodeURIComponent(markup),
        type: 'image',
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        derived: true
      });
    });
    return items;
  }

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

    collectImages(trackImage);
    collectVideos(trackVideo);

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
      // Responsive images render their srcset-chosen candidate; only trust the
      // natural size when the queried URL is actually the one being rendered
      const activeUrl = el.currentSrc || el.src;
      if (activeUrl === url) {
        return { width: el.naturalWidth, height: el.naturalHeight };
      }
    }
    return null;
  }

  const pendingNetworkFilter = new Set();

  function passesSizeFilter(size) {
    if (!size) return false;
    // A successful load reporting 0×0 is an SVG without intrinsic size —
    // exempt it like explicit .svg URLs (extension-less SVG CDN endpoints)
    if (size.width === 0 && size.height === 0) return true;
    return size.width >= MIN_IMAGE_SIZE && size.height >= MIN_IMAGE_SIZE;
  }

  async function filterImagesBySize(urls, providedSizeMap) {
    let sizeMap = providedSizeMap;
    if (!sizeMap) {
      sizeMap = new Map();
      const imgs = document.images;
      const len = imgs.length;
      for (let i = 0; i < len; i++) {
        const img = imgs[i];
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          sizeMap.set(img.currentSrc || img.src, { width: img.naturalWidth, height: img.naturalHeight });
        }
      }
    }

    const results = await Promise.all(
      [...urls].map(async (url) => {
        if (isSvgUrl(url)) return url;
        const domSize = sizeMap.get(url) || getDomImageSize(url);
        if (domSize) {
          return passesSizeFilter(domSize) ? url : null;
        }

        // Lazy network fetch: if popup is closed, delay the expensive new Image() call
        if (!popupPort) {
          pendingNetworkFilter.add(url);
          return null;
        }

        const size = await getImageSize(url);
        return passesSizeFilter(size) ? url : null;
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

    const sizeMap = type === 'image' ? new Map() : null;
    if (sizeMap) {
      const imgs = document.images;
      const len = imgs.length;
      for (let i = 0; i < len; i++) {
        const img = imgs[i];
        if (img.naturalWidth > 0 && img.naturalHeight > 0) {
          sizeMap.set(img.currentSrc || img.src, { width: img.naturalWidth, height: img.naturalHeight });
        }
      }
    }

    let accepted;
    if (type === 'video') {
      // Videos skip size filtering — can't measure with new Image()
      accepted = unknown;
    } else {
      accepted = await filterImagesBySize(new Set(unknown), sizeMap);
    }

    const items = accepted.map((url) => {
      const size = type === 'image' ? (sizeMap.get(url) || getDomImageSize(url)) : null;
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

  function handleImg(el, imageSet) {
    if (el.tagName === 'IMG') {
      // With a srcset present, src is just another variant of the same image
      const hasSet = el.hasAttribute('srcset') || el.hasAttribute('data-srcset') || el.parentElement?.tagName === 'PICTURE';
      const attrs = ['src', 'data-src', 'data-lazy-src', 'data-original'];
      for (const attr of attrs) {
        let val;
        if (attr === 'src') val = hasSet ? null : el.src;
        else val = el.hasAttribute(attr) ? el.getAttribute(attr) : null;
        if (val) {
          const url = resolveUrl(val);
          if (url && !url.startsWith('data:')) imageSet.add(url);
        }
      }
    }
  }

  function handleSrcset(el, imageSet) {
    if (el.hasAttribute) {
      // Picture sources are format alternatives handled by handleSource
      if (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'PICTURE') return;
      const raw = pickBestFromSrcset(el.getAttribute('srcset')) ||
                  pickBestFromSrcset(el.getAttribute('data-srcset')) ||
                  pickBestFromSrcset(el.getAttribute('data-bgset'));
      if (raw) {
        const url = resolveUrl(raw);
        if (url && !url.startsWith('data:')) imageSet.add(url);
      }
    }
  }

  function handleVideo(el, imageSet, videoSet) {
    if (el.tagName === 'VIDEO') {
      const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
      if (src) {
        const url = resolveUrl(src);
        if (url && !url.startsWith('data:')) videoSet.add(url);
      }
      const poster = el.getAttribute('poster') || el.getAttribute('data-poster');
      if (poster) {
        const url = resolveUrl(poster);
        if (url && !url.startsWith('data:')) imageSet.add(url);
      }
    }
  }

  function handleSource(el, imageSet, videoSet) {
    if (el.tagName === 'SOURCE') {
      if (el.parentElement?.tagName === 'VIDEO') {
        const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-lazy-src') || el.getAttribute('data-original');
        if (src) {
          const url = resolveUrl(src);
          if (url && !url.startsWith('data:')) videoSet.add(url);
        }
      } else if (el.parentElement?.tagName === 'PICTURE') {
        // Handled per-picture in extractUrlsFromElement
      }
    }
  }

  function processBgImageQueue(deadline) {
    const imageUrls = new Set();
    const timeRemaining = deadline ? () => deadline.timeRemaining() : () => 50;

    while (pendingBackgroundCheckQueue.length > 0 && timeRemaining() > 0) {
      const el = pendingBackgroundCheckQueue.shift();
      try {
        for (const raw of getCssMediaUrls(el)) {
          const url = resolveUrl(raw);
          if (url && isImageUrl(url) && !url.startsWith('data:')) imageUrls.add(url);
        }
      } catch {
        // Element may not be connected to DOM yet
      }
    }

    if (imageUrls.size > 0) addNewUrls(imageUrls, 'image');

    if (pendingBackgroundCheckQueue.length > 0) {
      if (typeof requestIdleCallback !== 'undefined') {
        requestIdleCallback(processBgImageQueue);
      } else {
        setTimeout(processBgImageQueue, 1);
      }
    } else {
      isBgCheckScheduled = false;
    }
  }

  function handleMeta(el, imageSet) {
    if (el.tagName === 'META') {
      const prop = el.getAttribute('property');
      const name = el.getAttribute('name');
      if (prop === 'og:image' || name === 'twitter:image') {
        const url = resolveUrl(el.getAttribute('content'));
        if (url && !url.startsWith('data:')) imageSet.add(url);
      }
    } else if (el.tagName === 'LINK' && el.getAttribute('rel') === 'preload' && el.getAttribute('as') === 'image') {
      const url = resolveUrl(el.getAttribute('href'));
      if (url && !url.startsWith('data:')) imageSet.add(url);
    }
  }

  function handleEmbed(el, imageSet) {
    const tag = el.tagName;
    if (tag !== 'OBJECT' && tag !== 'EMBED' && tag !== 'IFRAME') return;
    const raw = tag === 'OBJECT' ? el.getAttribute('data') : el.getAttribute('src');
    const url = resolveUrl(raw);
    if (url && isImageUrl(url) && !url.startsWith('data:')) imageSet.add(url);
  }

  function handleBackgroundImage(el, imageSet) {
    // Fast path: skip elements with no styling hints to avoid expensive getComputedStyle calls
    if (el.className || el.id || el.getAttribute('style')) {
      pendingBackgroundCheckQueue.push(el);
      if (!isBgCheckScheduled) {
        isBgCheckScheduled = true;
        if (typeof requestIdleCallback !== 'undefined') {
          requestIdleCallback(processBgImageQueue);
        } else {
          setTimeout(processBgImageQueue, 1);
        }
      }
    }
  }

  function handlePicture(el, imageSet) {
    if (el.tagName === 'PICTURE') {
      const img = el.querySelector('img');
      if (img && img.currentSrc) {
        const url = resolveUrl(img.currentSrc);
        if (url && !url.startsWith('data:')) imageSet.add(url);
        return;
      }
      for (const source of el.querySelectorAll('source')) {
        const best = pickBestFromSrcset(source.getAttribute('srcset')) ||
                     pickBestFromSrcset(source.getAttribute('data-srcset')) ||
                     source.getAttribute('src') || source.getAttribute('data-src') ||
                     source.getAttribute('data-lazy-src') || source.getAttribute('data-original');
        if (best) {
          const url = resolveUrl(best);
          if (url && !url.startsWith('data:')) imageSet.add(url);
          return;
        }
      }
    }
  }

  function handleSvgImage(el, imageSet) {
    if (el.tagName === 'image' || el.tagName === 'IMAGE') {
      const raw = el.getAttribute('href') || el.getAttribute('xlink:href');
      const url = resolveUrl(raw);
      if (url && !url.startsWith('data:')) imageSet.add(url);
    }
  }

  function handleDataBg(el, imageSet) {
    if (el.hasAttribute) {
      const attrs = ['data-bg', 'data-bg-src', 'data-background', 'data-background-image'];
      for (const attr of attrs) {
        if (el.hasAttribute(attr)) {
          const bg = el.getAttribute(attr);
          if (bg) {
            if (bg.includes('url(') || bg.includes('image-set(')) {
              for (const raw of extractBgImageUrls(bg)) {
                const url = resolveUrl(raw);
                if (url && !url.startsWith('data:')) imageSet.add(url);
              }
            } else {
              const url = resolveUrl(bg.trim());
              if (isImageUrl(url) && !url.startsWith('data:')) imageSet.add(url);
            }
          }
        }
      }
    }
  }

  function extractUrlsFromElement(el, imageSet, videoSet) {
    handleImg(el, imageSet);
    handleSrcset(el, imageSet);
    handleVideo(el, imageSet, videoSet);
    handleSource(el, imageSet, videoSet);
    handleBackgroundImage(el, imageSet);
    handleDataBg(el, imageSet);
    handleMeta(el, imageSet);
    handleEmbed(el, imageSet);
    handlePicture(el, imageSet);
    handleSvgImage(el, imageSet);
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
          if (node.getElementsByTagName) {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT, null, false);
            let el;
            while ((el = walker.nextNode())) {
              const tag = el.tagName;
              if (
                TAG_SET.has(tag) ||
                (el.hasAttributes && el.hasAttributes() && (
                  el.hasAttribute('srcset') || el.hasAttribute('data-srcset') || el.hasAttribute('data-bgset') ||
                  el.hasAttribute('data-src') || el.hasAttribute('data-lazy-src') || el.hasAttribute('data-original') ||
                  el.hasAttribute('data-bg') || el.hasAttribute('data-bg-src') || el.hasAttribute('data-background') ||
                  el.hasAttribute('data-background-image') ||
                  (el.hasAttribute('style') && el.style && el.style.backgroundImage)
                ))
              ) {
                extractUrlsFromElement(el, imageUrls, videoUrls);
              }
            }
          }
        }
      }
      if (imageUrls.size > 0) addNewUrls(imageUrls, 'image');
      if (videoUrls.size > 0) addNewUrls(videoUrls, 'video');
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function setupPerformanceObserver() {
    try {
      const observer = new PerformanceObserver((list) => {
        const imageUrls = new Set();
        const videoUrls = new Set();
        // URLs currently rendered by srcset-bearing imgs: the structural scan
        // already tracked their best candidate — re-adding the rendered
        // variant would duplicate the same image under a second URL
        let renderedVariants = null;
        const getRenderedVariants = () => {
          if (renderedVariants) return renderedVariants;
          renderedVariants = new Set();
          const imgs = document.images;
          for (let i = 0, len = imgs.length; i < len; i++) {
            const im = imgs[i];
            if (im.currentSrc && (im.hasAttribute('srcset') || im.hasAttribute('data-srcset') || im.parentElement?.tagName === 'PICTURE')) {
              renderedVariants.add(im.currentSrc);
            }
          }
          return renderedVariants;
        };
        for (const entry of list.getEntries()) {
          const url = resolveUrl(entry.name);
          if (!url || url.startsWith('data:') || discoveredMedia.has(url)) continue;

          if (isVideoUrl(url) || entry.initiatorType === 'video') {
            videoUrls.add(url);
          } else if (IMAGE_EXT_RE.test(entry.name) || entry.initiatorType === 'img') {
            if (entry.initiatorType === 'img' && getRenderedVariants().has(url)) continue;
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
  if (typeof browser !== 'undefined' && browser.runtime) {
    browser.runtime.onConnect.addListener((port) => {
      if (port.name !== 'imgsnag-popup') return;
      popupPort = port;

      // Capture inline SVGs now so they ride along in the init payload
      for (const item of collectInlineSvgs()) {
        if (!discoveredMedia.has(item.url)) discoveredMedia.set(item.url, item);
      }

      port.postMessage({ action: 'init', images: [...discoveredMedia.values()] });

      // Flush the background image check queue synchronously so the grid is complete
      if (pendingBackgroundCheckQueue.length > 0) {
        const imageUrls = new Set();
        while (pendingBackgroundCheckQueue.length > 0) {
          const el = pendingBackgroundCheckQueue.shift();
          try {
            for (const raw of getCssMediaUrls(el)) {
              const url = resolveUrl(raw);
              if (url && isImageUrl(url) && !url.startsWith('data:')) imageUrls.add(url);
            }
          } catch {
            // Element may not be connected to DOM yet
          }
        }
        if (imageUrls.size > 0) addNewUrls(imageUrls, 'image');
      }

      // Process any images that were lazily delayed until the popup connected
      if (pendingNetworkFilter.size > 0) {
        const urls = new Set(pendingNetworkFilter);
        pendingNetworkFilter.clear();
        addNewUrls(urls, 'image');
      }

      port.onDisconnect.addListener(() => {
        popupPort = null;
      });
    });
  }

  // Initial scan

  async function initialScan() {
    const { imageUrls, videoUrls } = collectMediaUrls();
    await addNewUrls(imageUrls, 'image');
    await addNewUrls(videoUrls, 'video');
    setupMutationObserver();
    setupPerformanceObserver();
  }

  if (typeof browser !== 'undefined' && browser.runtime) {
    initialScan();
  }

  // Alt+Click — downloads the image(s) stacked under the cursor

  function getTargetUrlsForElement(el) {
    const urls = [];

    if (el.tagName === 'IMG' && el.src) {
      const url = resolveUrl(el.src);
      if (url && !url.startsWith('data:')) urls.push(url);
      return urls;
    }

    if (el.tagName === 'VIDEO') {
      const url = resolveUrl(el.src || el.querySelector('source')?.src);
      if (url && !url.startsWith('data:')) urls.push(url);
      return urls;
    }

    for (const raw of getCssMediaUrls(el)) {
      const url = resolveUrl(raw);
      if (url && isImageUrl(url) && !url.startsWith('data:')) urls.push(url);
    }

    return urls;
  }

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

      for (const raw of getCssMediaUrls(el)) {
        const url = resolveUrl(raw);
        if (url && isImageUrl(url) && !url.startsWith('data:') && !downloadedUrls.has(url)) {
          downloadedUrls.add(url);
          sendToBackground({ action: 'download_image', url });
          didDownload = true;
        }
      }
    }

    if (didDownload) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  document.addEventListener('click', (e) => {
    // Warden: Prevent hostile pages from synthesizing events to force downloads
    if (!e.isTrusted) return;
    if (e.altKey) {
      downloadImagesAtPoint(e);
    }
  });

  // Drag-to-save (can be disabled in options)
  document.addEventListener('dragend', (e) => {
    // Warden: Prevent hostile pages from synthesizing events to force downloads
    if (!e.isTrusted) return;
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
    if (typeof browser !== 'undefined' && browser.storage) {
      browser.storage.sync.get({ disableDrag: false }).then((items) => {
        isDragDisabled = items.disableDrag;
      });
    }
  }

  syncDragPreference();
  browser.storage.onChanged.addListener(() => syncDragPreference());
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getCssMediaUrls, extractBgImageUrls, resolveUrl, isVideoUrl, isImageUrl, isSvgUrl, parseSrcset, pickBestFromSrcset, collectInlineSvgs, handleEmbed, passesSizeFilter, handleMeta, collectMediaUrls, handleSource, handlePicture, handleSvgImage, handleDataBg };
  }
})();
