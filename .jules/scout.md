## 2023-10-01 - Example
**Learning:** Example
**Action:** Example

## 2024-05-24 - Missed Lazy Loaded Images
**Learning:** Common lazy-loading attributes (`data-src`, `data-lazy-src`, `data-original`, and `data-srcset`) are missed by `PerformanceObserver` and standard `img[src]` DOM scans because they are not loaded by the browser network and their `src` attributes are placeholders (like `data:` URIs).
**Action:** Explicitly query `img[data-src]`, `img[data-lazy-src]`, `img[data-original]`, and `[data-srcset]` in DOM scanning functions (`collectMediaUrls` and `extractUrlsFromElement`), and adapt Alt+Click and Drag-to-save listeners to fall back to these attributes.

## 2026-08-15 - Meta and Preload Image Support
**Learning:** Meta open graph images (`og:image`, `twitter:image`) and preload hints (`link[rel="preload"][as="image"]`) are commonly used for article/page thumbnails but are missed by standard `img` and `background-image` scanners. These elements reside in the `<head>` and provide valuable high-quality previews.
**Action:** Add detection for `meta[property="og:image"]`, `meta[name="twitter:image"]`, and `link[rel="preload"][as="image"]` in `collectImages()` and handle dynamically added `META`/`LINK` nodes in the MutationObserver and `extractUrlsFromElement`. Change MutationObserver to observe `document.documentElement` to catch `<head>` modifications.

## 2024-11-20 - image-set() CSS Property Support
**Learning:** `image-set()` and `-webkit-image-set()` in CSS background values often contain raw string URLs (e.g., `image-set("img.png" 1x)`) that do not use the standard `url()` wrapper. The `extractBgImageUrls` function previously only extracted URLs wrapped in `url()`, missing these images.
**Action:** Added `IMAGE_SET_RE` and parsing logic inside `extractBgImageUrls` to split the `image-set` contents by commas and extract raw string URLs that start with quotes.
## 2026-08-19 - Inline SVG capture is message-design first, detection second (RFC #118 stage 1)
**Learning:** Derived files must not ride the URL pipeline: sending serialized markup under a dedicated `download_svg` action (background constructs the blob/data URL itself) keeps the http/https allowlist on `download_image` fully intact. Chrome MV3 service workers lack `URL.createObjectURL`, so the data: fallback is mandatory there while Firefox event pages use blob + revoke-on-onChanged. Rendered `getBoundingClientRect` size IS measurable for inline SVG, inverting the external-SVG size-exemption.
**Action:** Any future derived-file channel (canvas, manifests) should follow this shape: dedicated action, fail-closed payload validation in background, popup-connect-only enumeration.
## 2026-08-19 - Embed-element sources and the 0x0 SVG signature
**Learning:** <object data>, <embed src>, and <iframe src> can point directly at image files and were only caught incidentally (absolute-URL text sweep or PerformanceObserver). Also, extension-less SVG endpoints load successfully but report 0x0 natural size from new Image(), so the extension-keyed SVG exemption silently dropped them — a successful load at 0x0 IS the SVG signature.
**Action:** Extension-check embed sources with isImageUrl to hold the false-positive line (iframes usually contain pages); centralize size acceptance in one helper (passesSizeFilter) so exemption rules stay consistent across DOM and network paths.

## 2024-05-24 - Missed Lazy Loaded Images in Picture Source Elements
**Learning:** The MutationObserver path `handleSource` previously only checked `<source>` elements within `<video>` tags. It missed `<source>` tags used within `<picture>` elements. Consequently, lazy-loaded attributes on dynamically inserted `<picture source>` tags (`data-src`, `data-lazy-src`, `data-original`) created an attribute-coverage drift between the initial scan `collectImages()` and the dynamic path.
**Action:** Updated `handleSource` and `extractUrlsFromElement` to pass an `imageSet` and extract `src`, `data-src`, `data-lazy-src`, and `data-original` when `el.parentElement.tagName === 'PICTURE'`.
## 2026-08-22 - False positive tracking pixels passing size filter via srcset
**Learning:** `img` elements that use `srcset` to load large images still list a tiny 1x1 tracking-pixel fallback in `src`. The size map keyed by `img.src` assigned the rendered srcset candidate's large naturalWidth/Height to the tracking pixel's URL, letting 1x1 pixels bypass the size filter and bloat the grid.
**Action:** Key size lookups by `img.currentSrc || img.src`, and in getDomImageSize only trust natural dimensions when the queried URL is the actively rendered one.
