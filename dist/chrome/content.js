// imgsnag — Content Script

(function () {
  'use strict';

  // Constants

  const IMAGE_EXT_RE = /\.(?:jpe?g|gif|png|webp|svg|avif)(?:[?#]|$)/i;
  const VIDEO_EXT_RE = /\.(?:mp4|webm|ogv|mov|m4v|avi)(?:[?#]|$)/i;
  const BG_URL_RE = /url\(["']?(.*?)["']?\)/gi;
  // RFC #223 stage 1: cheap gate before any URL construction, then the strict
  // CMS "-WxH" variant suffix it synthesizes an original from.
  const WP_SUFFIX_FAST_RE = /-\d+x\d+\./;
  const WP_SUFFIX_RE = /-\d+x\d+(\.(?:jpe?g|png|webp|gif|avif))$/i;

  // Catches image URLs embedded in inline scripts or JSON-LD that DOM queries miss
  const IMAGE_URL_RE =
    /https?:(?:\\?\/){2}[^\s"'<>]+\.(?:jpe?g|gif|png|webp|svg|avif)(?:\?[^\s"'<>]*)?/gi;

  // Cheap pre-check before the expensive URL sweep. Case-insensitive because
  // IMAGE_URL_RE is: a literal includes('http') check would miss "HtTp://".
  const HTTP_HINT_RE = /http/i;

  // Stateless, so the initial sweep and the MutationObserver share one instance
  // rather than rebuilding it per added subtree. <style> never holds image URLs
  // the CSS scan misses; <script> is only worth sweeping when it carries JSON.
  const REGEX_SWEEP_FILTER = {
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
  };

  const BG_IMAGE_SELECTORS =
    'div, span, section, article, header, footer, a, li, figure, i, [style*="background"]';

  const MIN_IMAGE_SIZE = 200;
  // Ceiling on simultaneous `new Image()` size probes. Each in-flight probe holds
  // a decoded bitmap, so an unbounded fan-out over a large gallery is a memory
  // spike, not just extra requests.
  const SIZE_PROBE_POOL_SIZE = 12;
  // Lazy-load attribute families. Hoisted because handleVideo/handleSource run
  // once per added node on the MutationObserver path, and a fresh array literal
  // per node is pure garbage. These are read as a *list*, not a preference
  // order: every populated attribute is tracked, because a placeholder `src`
  // sitting next to the real `data-src` is the whole lazy-load pattern.
  const MEDIA_SRC_ATTRS = ['src', 'data-src', 'data-lazy-src', 'data-original'];
  const POSTER_ATTRS = ['poster', 'data-poster'];
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


  function trackImageUrl(raw, urlSet) {
    const url = resolveUrl(raw);
    if (!url || url.startsWith('data:')) return;
    urlSet.add(url);
    if (WP_SUFFIX_FAST_RE.test(url)) {
      try {
        const parsed = new URL(url);
        if (WP_SUFFIX_RE.test(parsed.pathname)) {
          parsed.pathname = parsed.pathname.replace(WP_SUFFIX_RE, '$1');
          const synth = resolveUrl(parsed.href);
          if (synth && !synth.startsWith('data:')) urlSet.add(synth);
        }
      } catch {}
    }
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

    const keyword = 'image-set(';
    let idx = 0;
    const lowerBg = bgValue.toLowerCase();
    while ((idx = lowerBg.indexOf(keyword, idx)) !== -1) {
      const start = idx + keyword.length;
      let depth = 1;
      let i = start;
      for (; i < bgValue.length; i++) {
        if (bgValue[i] === '(') depth++;
        else if (bgValue[i] === ')') depth--;
        if (depth === 0) break;
      }
      const inner = bgValue.substring(start, i);
      // url() variants are already collected by BG_URL_RE above; type() carries a
      // MIME string, not a URL — strip both before harvesting bare-string variants.
      const withoutUrls = inner.replace(/(?:url|type)\([^)]*\)/gi, '');
      const QUOTE_RE = /(["'])(.*?)\1/g;
      let quoteMatch;
      while ((quoteMatch = QUOTE_RE.exec(withoutUrls)) !== null) {
        if (quoteMatch[2].trim()) urls.push(quoteMatch[2]);
      }
      idx = i + 1;
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

    let pos = 0;
    while (pos < srcset.length) {
      while (pos < srcset.length && /\s/.test(srcset[pos])) pos++;
      if (pos >= srcset.length) break;

      let url = "";
      while (pos < srcset.length && !/\s/.test(srcset[pos])) {
        url += srcset[pos];
        pos++;
      }

      let descriptor = "";
      if (url.endsWith(',')) {
        url = url.slice(0, -1);
      } else {
        while (pos < srcset.length && /\s/.test(srcset[pos])) pos++;
        while (pos < srcset.length && srcset[pos] !== ',') {
          descriptor += srcset[pos];
          pos++;
        }
        if (pos < srcset.length && srcset[pos] === ',') pos++;
      }

      if (!url) continue;

      let score = 1;
      descriptor = descriptor.trim();
      if (descriptor) {
        const parts = descriptor.split(/\s+/);
        for (const d of parts) {
          const n = parseFloat(d);
          if (!Number.isNaN(n)) score = /w$/i.test(d) ? n : n * 1000;
        }
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
    // <meta> Open Graph / Twitter, <link rel="preload"> hints, and icons
    document.querySelectorAll('meta[property="og:image"], meta[property="og:image:secure_url"], meta[name="twitter:image"], meta[itemprop="image"], link[rel="preload"][as="image"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"], link[rel="image_src"], link[rel="mask-icon"], link[itemprop="image"]').forEach((el) => {
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
    document.querySelectorAll('[srcset], [data-srcset], [data-bgset], [imagesrcset]').forEach((el) => {
      if (el.tagName === 'SOURCE' && el.parentElement?.tagName === 'PICTURE') return;
      const best = pickBestFromSrcset(el.getAttribute('srcset')) ||
                   pickBestFromSrcset(el.getAttribute('data-srcset')) ||
                   pickBestFromSrcset(el.getAttribute('data-bgset')) ||
                   pickBestFromSrcset(el.getAttribute('imagesrcset'));
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
      POSTER_ATTRS.forEach(attr => {
        const val = video.getAttribute(attr);
        if (val) trackImage(val);
      });
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
      document.documentElement,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      REGEX_SWEEP_FILTER
    );

    let node;
    while ((node = walker.nextNode())) {
      extractRegexUrls(node, trackImage);
    }
  }

  // Shared by the initial sweep and the MutationObserver: pulls image URLs out
  // of a single node's text content or attribute values.
  function extractRegexUrls(node, trackImage) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue && HTTP_HINT_RE.test(node.nodeValue)) {
        let match;
        IMAGE_URL_RE.lastIndex = 0;
        while ((match = IMAGE_URL_RE.exec(node.nodeValue)) !== null) {
          let url = match[0];
          if (url.includes('\\')) url = url.replace(/\\/g, '');
          trackImage(url);
        }
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (!node.hasAttributes()) return;
      const names = node.getAttributeNames();
      for (let i = 0, len = names.length; i < len; i++) {
        // srcset-family attributes hold many variants of one image; the
        // structural scan already tracked the best candidate
        const name = names[i];
        if (name.includes('srcset')) continue;
        const val = node.getAttribute(name);
        if (val && HTTP_HINT_RE.test(val)) {
          let match;
          IMAGE_URL_RE.lastIndex = 0;
          while ((match = IMAGE_URL_RE.exec(val)) !== null) {
            let url = match[0];
            if (url.includes('\\')) url = url.replace(/\\/g, '');
            trackImage(url);
          }
        }
      }
    }
  }

  function collectVideos(trackVideo) {
    // <video src> and lazy loaded variants
    document.querySelectorAll('video[src], video[data-src], video[data-lazy-src], video[data-original]').forEach((video) => {
      MEDIA_SRC_ATTRS.forEach(attr => {
        const val = video.getAttribute(attr);
        if (val) trackVideo(val);
      });
    });
    // <video><source src> and lazy loaded variants
    document.querySelectorAll('video source[src], video source[data-src], video source[data-lazy-src], video source[data-original]').forEach((source) => {
      MEDIA_SRC_ATTRS.forEach(attr => {
        const val = source.getAttribute(attr);
        if (val) trackVideo(val);
      });
    });
  }

  // Inline <svg> elements have no URL — serialize them into data: URLs on
  // demand. Only runs when the popup connects (never during ambient
  // discovery) so pages that are never snagged pay nothing.
  function collectInlineSvgs() {
    const items = [];
    document.querySelectorAll('svg').forEach((svg) => {
      if (svg.ownerSVGElement) return; // nested <svg> — captured via its root
      const rect = svg.getBoundingClientRect();
      if (rect.width < MIN_IMAGE_SIZE || rect.height < MIN_IMAGE_SIZE) return;
      let markup;
      try {
        markup = new XMLSerializer().serializeToString(svg);
      } catch {
        return;
      }
      if (!markup || markup.length > MAX_INLINE_SVG_CHARS) return;
      // stage 1: <use> refs serialize empty. Checked on the serialized markup, not
      // via querySelector('use') — the HTML parser keeps a foreign-content prefix in
      // the local name, so `<foo:use>` parses to localName "foo:use" and no CSS type
      // selector matches it. Prefix charset is "anything but > , whitespace, colon"
      // because XML names admit `.` and `_` too. Runs after the length cap.
      if (/<(?:[^>\s:]+:)?use\b/i.test(markup)) return;
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
      trackImageUrl(url, imageUrls);
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
    // Warden: Trust boundary - CSS.escape mitigates selector injection from page-controlled URLs
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

    const arr = [...urls];
    const results = new Array(arr.length);
    const pendingIndexes = [];

    for (let index = 0; index < arr.length; index++) {
      const url = arr[index];
      if (isSvgUrl(url)) {
        results[index] = url;
        continue;
      }
      const domSize = sizeMap.get(url) || getDomImageSize(url);
      if (domSize) {
        results[index] = passesSizeFilter(domSize) ? url : null;
        continue;
      }
      // Lazy network fetch: if popup is closed, delay the expensive new Image() call
      if (!popupPort) {
        pendingNetworkFilter.add(url);
        results[index] = null;
        continue;
      }
      pendingIndexes.push(index);
    }

    // Shared cursor: `pendingPos++` is atomic under JS's single-threaded model,
    // so N workers can pull from one queue without a lock. Results are written
    // back by index, never appended, so output order matches input order even
    // though probes settle out of order.
    let pendingPos = 0;

    async function worker() {
      while (pendingPos < pendingIndexes.length) {
        const index = pendingIndexes[pendingPos++];
        const url = arr[index];
        const size = await getImageSize(url);
        results[index] = passesSizeFilter(size) ? url : null;
      }
    }

    const workers = [];
    for (let w = 0; w < SIZE_PROBE_POOL_SIZE && w < pendingIndexes.length; w++) {
      workers.push(worker());
    }
    if (workers.length > 0) {
      await Promise.all(workers);
    }

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
          trackImageUrl(val, imageSet);
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
                  pickBestFromSrcset(el.getAttribute('data-bgset')) ||
                  pickBestFromSrcset(el.getAttribute('imagesrcset'));
      if (raw) {
        trackImageUrl(raw, imageSet);
      }
    }
  }

  function handleVideo(el, imageSet, videoSet) {
    if (el.tagName === 'VIDEO') {
      MEDIA_SRC_ATTRS.forEach(attr => {
        const val = el.getAttribute(attr);
        if (val) {
          const url = resolveUrl(val);
          if (url && !url.startsWith('data:')) videoSet.add(url);
        }
      });
      POSTER_ATTRS.forEach(attr => {
        const val = el.getAttribute(attr);
        if (val) {
          trackImageUrl(val, imageSet);
        }
      });
    }
  }

  function handleSource(el, imageSet, videoSet) {
    if (el.tagName === 'SOURCE') {
      if (el.parentElement?.tagName === 'VIDEO') {
        MEDIA_SRC_ATTRS.forEach(attr => {
          const val = el.getAttribute(attr);
          if (val) {
            const url = resolveUrl(val);
            if (url && !url.startsWith('data:')) videoSet.add(url);
          }
        });
      } else if (el.parentElement?.tagName === 'PICTURE') {
        // Handled per-picture in extractUrlsFromElement
      }
    }
  }

  function processBgImageQueue(deadline) {
    const imageUrls = new Set();
    const timeRemaining = deadline ? () => deadline.timeRemaining() : () => 50;

    let processed = 0;
    while (processed < pendingBackgroundCheckQueue.length && timeRemaining() > 0) {
      const el = pendingBackgroundCheckQueue[processed++];
      try {
        for (const raw of getCssMediaUrls(el)) {
          const url = resolveUrl(raw);
          if (url && isImageUrl(url) && !url.startsWith('data:')) imageUrls.add(url);
        }
      } catch {
        // Element may not be connected to DOM yet
      }
    }
    if (processed > 0) {
      pendingBackgroundCheckQueue.splice(0, processed);
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
      const itemprop = el.getAttribute('itemprop');
      if (prop === 'og:image' || prop === 'og:image:secure_url' || name === 'twitter:image' || itemprop === 'image') {
        trackImageUrl(el.getAttribute('content'), imageSet);
      }
    } else if (el.tagName === 'LINK') {
      const rel = el.getAttribute('rel');
      const asAttr = el.getAttribute('as');
      const itemprop = el.getAttribute('itemprop');
      // <link rel=preload as=image imagesrcset="..."> — the responsive preload
      // form. `href` is only the fallback for browsers that ignore imagesrcset,
      // so when a candidate resolves we take it and skip href, the same way
      // <picture> sources and <img srcset> avoid emitting the fallback twice.
      if (rel === 'preload' && asAttr === 'image') {
        const best = pickBestFromSrcset(el.getAttribute('imagesrcset'));
        if (best) {
          trackImageUrl(best, imageSet);
          return;
        }
      }
      if ((rel === 'preload' && asAttr === 'image') || rel === 'icon' || rel === 'apple-touch-icon' || rel === 'shortcut icon' || rel === 'image_src' || rel === 'mask-icon' || itemprop === 'image') {
        trackImageUrl(el.getAttribute('href'), imageSet);
      }
    }
  }

  function handleEmbed(el, imageSet) {
    const tag = el.tagName;
    if (tag !== 'OBJECT' && tag !== 'EMBED' && tag !== 'IFRAME') return;
    const raw = tag === 'OBJECT' ? el.getAttribute('data') : el.getAttribute('src');
    const url = resolveUrl(raw);
    if (url && isImageUrl(url) && !url.startsWith('data:')) trackImageUrl(url, imageSet);
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
        trackImageUrl(img.currentSrc, imageSet);
        return;
      }
      for (const source of el.querySelectorAll('source')) {
        const best = pickBestFromSrcset(source.getAttribute('srcset')) ||
                     pickBestFromSrcset(source.getAttribute('data-srcset')) ||
                     source.getAttribute('src') || source.getAttribute('data-src') ||
                     source.getAttribute('data-lazy-src') || source.getAttribute('data-original');
        if (best) {
          trackImageUrl(best, imageSet);
          return;
        }
      }
    }
  }

  function handleSvgImage(el, imageSet) {
    if (el.tagName === 'image' || el.tagName === 'IMAGE') {
      const raw = el.getAttribute('href') || el.getAttribute('xlink:href');
      trackImageUrl(raw, imageSet);
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
                trackImageUrl(raw, imageSet);
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
      // Hoisted out of the node loops: one closure per batch, not per node
      const trackSweptImage = (url) => {
        trackImageUrl(url, imageUrls);
      };
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            extractUrlsFromElement(node, imageUrls, videoUrls);
          }

          if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
            extractRegexUrls(node, trackSweptImage);
          }

          if (node.nodeType === Node.ELEMENT_NODE) {
            const walker = document.createTreeWalker(
              node,
              NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
              REGEX_SWEEP_FILTER
            );

            let el;
            while ((el = walker.nextNode())) {
              extractRegexUrls(el, trackSweptImage);
              if (el.nodeType !== Node.ELEMENT_NODE) continue;
              const tag = el.tagName;
              if (
                TAG_SET.has(tag) ||
                (el.hasAttributes && el.hasAttributes() && (
                  el.hasAttribute('srcset') || el.hasAttribute('data-srcset') || el.hasAttribute('data-bgset') || el.hasAttribute('imagesrcset') ||
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
        let processed = 0;
        while (processed < pendingBackgroundCheckQueue.length) {
          const el = pendingBackgroundCheckQueue[processed++];
          try {
            for (const raw of getCssMediaUrls(el)) {
              const url = resolveUrl(raw);
              if (url && isImageUrl(url) && !url.startsWith('data:')) imageUrls.add(url);
            }
          } catch {
            // Element may not be connected to DOM yet
          }
        }
        if (processed > 0) {
          pendingBackgroundCheckQueue.splice(0, processed);
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
    module.exports = { handleSrcset, trackImageUrl, getDomImageSize, getCssMediaUrls, extractBgImageUrls, resolveUrl, isVideoUrl, isImageUrl, isSvgUrl, parseSrcset, pickBestFromSrcset, collectInlineSvgs, handleEmbed, passesSizeFilter, handleMeta, collectMediaUrls, handleSource, handlePicture, handleSvgImage, handleDataBg, extractRegexUrls, handleVideo, filterImagesBySize, SIZE_PROBE_POOL_SIZE };
  }
})();
