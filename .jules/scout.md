## 2023-10-01 - Example
**Learning:** Example
**Action:** Example

## 2026-08-25 - Missed Lazy Loaded Images
**Learning:** Common lazy-loading attributes (`data-src`, `data-lazy-src`, `data-original`, and `data-srcset`) are missed by `PerformanceObserver` and standard `img[src]` DOM scans because they are not loaded by the browser network and their `src` attributes are placeholders (like `data:` URIs).
**Action:** Explicitly query `img[data-src]`, `img[data-lazy-src]`, `img[data-original]`, and `[data-srcset]` in DOM scanning functions (`collectMediaUrls` and `extractUrlsFromElement`), and adapt Alt+Click and Drag-to-save listeners to fall back to these attributes.

## 2026-08-15 - Meta and Preload Image Support
**Learning:** Meta open graph images (`og:image`, `twitter:image`) and preload hints (`link[rel="preload"][as="image"]`) are commonly used for article/page thumbnails but are missed by standard `img` and `background-image` scanners. These elements reside in the `<head>` and provide valuable high-quality previews.
**Action:** Add detection for `meta[property="og:image"]`, `meta[name="twitter:image"]`, and `link[rel="preload"][as="image"]` in `collectImages()` and handle dynamically added `META`/`LINK` nodes in the MutationObserver and `extractUrlsFromElement`. Change MutationObserver to observe `document.documentElement` to catch `<head>` modifications.

## 2026-08-25 - image-set() CSS Property Support
**Learning:** `image-set()` and `-webkit-image-set()` in CSS background values often contain raw string URLs (e.g., `image-set("img.png" 1x)`) that do not use the standard `url()` wrapper. The `extractBgImageUrls` function previously only extracted URLs wrapped in `url()`, missing these images.
**Action:** Added `IMAGE_SET_RE` and parsing logic inside `extractBgImageUrls` to split the `image-set` contents by commas and extract raw string URLs that start with quotes.
## 2026-08-19 - Inline SVG capture is message-design first, detection second (RFC #118 stage 1)
**Learning:** Derived files must not ride the URL pipeline: sending serialized markup under a dedicated `download_svg` action (background constructs the blob/data URL itself) keeps the http/https allowlist on `download_image` fully intact. Chrome MV3 service workers lack `URL.createObjectURL`, so the data: fallback is mandatory there while Firefox event pages use blob + revoke-on-onChanged. Rendered `getBoundingClientRect` size IS measurable for inline SVG, inverting the external-SVG size-exemption.
**Action:** Any future derived-file channel (canvas, manifests) should follow this shape: dedicated action, fail-closed payload validation in background, popup-connect-only enumeration.
## 2026-08-19 - Embed-element sources and the 0x0 SVG signature
**Learning:** <object data>, <embed src>, and <iframe src> can point directly at image files and were only caught incidentally (absolute-URL text sweep or PerformanceObserver). Also, extension-less SVG endpoints load successfully but report 0x0 natural size from new Image(), so the extension-keyed SVG exemption silently dropped them — a successful load at 0x0 IS the SVG signature.
**Action:** Extension-check embed sources with isImageUrl to hold the false-positive line (iframes usually contain pages); centralize size acceptance in one helper (passesSizeFilter) so exemption rules stay consistent across DOM and network paths.

## 2026-08-25 - Missed Lazy Loaded Images in Picture Source Elements
**Learning:** The MutationObserver path `handleSource` previously only checked `<source>` elements within `<video>` tags. It missed `<source>` tags used within `<picture>` elements. Consequently, lazy-loaded attributes on dynamically inserted `<picture source>` tags (`data-src`, `data-lazy-src`, `data-original`) created an attribute-coverage drift between the initial scan `collectImages()` and the dynamic path.
**Action:** Updated `handleSource` and `extractUrlsFromElement` to pass an `imageSet` and extract `src`, `data-src`, `data-lazy-src`, and `data-original` when `el.parentElement.tagName === 'PICTURE'`.
## 2026-08-22 - False positive tracking pixels passing size filter via srcset
**Learning:** `img` elements that use `srcset` to load large images still list a tiny 1x1 tracking-pixel fallback in `src`. The size map keyed by `img.src` assigned the rendered srcset candidate's large naturalWidth/Height to the tracking pixel's URL, letting 1x1 pixels bypass the size filter and bloat the grid.
**Action:** Key size lookups by `img.currentSrc || img.src`, and in getDomImageSize only trust natural dimensions when the queried URL is the actively rendered one.
## 2026-08-22 - srcset/picture variants flooded the grid with duplicates
**Learning:** Tracking every srcset candidate and every <picture> source meant each image appeared once per width variant and once per format (user report from sonos.com: 475 cells, 426 of them query-string duplicates — 90% of the grid). The PerformanceObserver added the rendered variant on top.
**Action:** One URL per image: pickBestFromSrcset (highest w/x descriptor) everywhere candidates were iterated; per-<picture> selection preferring img.currentSrc; skip img src when a srcset exists; skip srcset-family attributes in the TreeWalker sweep; skip rendered srcset variants in the PerformanceObserver. Verified with tools/e2e-smoke.mjs on the reported page: 475→52 cells, 426→3 dupes.
## 2026-08-22 - Visual dedup via dHash in the popup
**Learning:** URL-level dedup cannot catch the same photo under genuinely different URLs (CDN crops, zoom variants). A 64-bit dHash (9x8 gradient fingerprint) over the already-rendered thumbnails groups near-identical images at negligible cost; fetch-to-blob avoids canvas taint via host permissions. Verified: a 3-variant fixture collapses to 1 visible cell. Known limits: dimensionless SVG blobs fail createImageBitmap (hash null, never hidden — safe), and aggressive crops that change aspect ratio are treated as distinct content on purpose.
**Action:** Keep dedup best-effort and popup-side only (zero ambient page cost); never hide an unhashable image; compare only within like aspect buckets.
## 2026-08-25 - MutationObserver drifting on picture/source and fallback duplicates
**Learning:** The initial scan handled `<picture>` as a unit, picking only the best candidate, but its `<img>` scan still checked `<img>` fallbacks without checking `img.parentElement?.tagName === 'PICTURE'`, generating duplicates. The MutationObserver's `handleSource` also individually scanned every `<source>` and recorded it, breaking the single-best-candidate rule for dynamic insertions.
**Action:** Exclude `<img>` elements inside `<picture>` from fallback `src` tracking in both `collectImages()` and `handleImg()`. Disable tracking `<source>` elements directly in `<picture>` elements for `handleSource()` since `handleImg` and the structure handles them appropriately or it prevents duplicate insertion spam. Added `handlePicture` to `extractUrlsFromElement`.
## 2026-08-25 - SVG <image> embed capture
**Learning:** Embedded images in SVGs using `<image href="..."/>` and `<image xlink:href="..."/>` are widely used and represent a valid image loading pattern that standard `img[src]` structural scans, MutationObserver tag matchers, and even TreeWalker URL regex sweeps (which only look for matching extensions) often miss.
**Action:** Added targeted DOM attribute extraction for `image` tags (`href` and `xlink:href`) to both the initial document query scan in `collectImages()` and the MutationObserver path `extractUrlsFromElement()`, and whitelisted the tag in the MutationObserver tree walker fast path.

## 2026-08-25 - CSS Masks and Pseudo-elements
**Learning:** Modern web apps heavily utilize CSS \`mask-image\` / \`-webkit-mask-image\` for monochromatic icons, and \`content: url(...)\` within pseudo-elements (\`::before\`, \`::after\`) for decorative graphics. These were entirely missed because the CSS media extraction previously only looked at \`style.backgroundImage\` on the element itself.
**Action:** Introduced \`getCssMediaUrls(el)\` helper function to extract URLs not just from \`backgroundImage\`, but also \`maskImage\`, \`webkitMaskImage\`, and \`content\`. Crucially, this function now also evaluates \`getComputedStyle(el, '::before')\` and \`getComputedStyle(el, '::after')\`. Updated all usages (MutationObserver, background idle queue, popup connect flush, Alt+Click) to use this generalized helper instead of directly reading \`backgroundImage\`. Tested and confirmed that \`getComputedStyle(el, pseudo)\` works and safely catches errors where not implemented.

## 2026-08-25 - Extracted URLs in JSON-LD with escaped slashes
**Learning:** Image URLs inside JSON-LD (`application/ld+json`) blocks or `data-*` attributes containing JSON often escape forward slashes as `\/`. The strict `IMAGE_URL_RE` regex missed these URLs because they contained `\\`. Replacing `//` with `(?:\\?\/){2}` and stripping the slashes allows detecting them safely without causing false positives.
**Action:** Relaxed `IMAGE_URL_RE` to allow escaped slashes `\\/` and implemented backslash stripping for any matches extracted during the TreeWalker scan.

## 2026-08-27 - Missed Lazy Loaded Videos and Video Posters
**Learning:** Like images, `<video>` tags and `<video><source>` tags often use `data-src`, `data-lazy-src`, and `data-original` for their sources, and `data-poster` for their posters. These were previously missed by the video discovery queries and handlers.
**Action:** Explicitly query `video[data-src]`, `video[data-lazy-src]`, `video[data-original]`, `video source[data-src]`, `video source[data-lazy-src]`, `video source[data-original]`, and `video[data-poster]` in DOM scanning functions (`collectImages`, `collectVideos`) and handle these attributes in the MutationObserver path (`handleVideo`, `handleSource`).
## 2026-08-28 - Lazy-loaded CSS backgrounds using data attributes
**Learning:** Many sites use `data-bg`, `data-bg-src`, `data-background`, `data-background-image`, or `data-bgset` for lazy-loading CSS backgrounds. These are missed by standard structural queries and the MutationObserver which only check `data-src` on images, and they are missed by the text/attribute regex sweep if they wrap the URL in `url(...)` because the sweep regex looks for bare URLs ending in extensions.
**Action:** Explicitly extract from `data-bg`, `data-bg-src`, `data-background`, and `data-background-image` in `collectImages()` and `extractUrlsFromElement()` by testing for CSS function wrappers vs. bare URLs. Also check `data-bgset` in `pickBestFromSrcset` logic.
## 2026-08-29 - application/json data in Script tags
**Learning:** Next.js and other frameworks embed application state, including image URLs, inside <script type="application/json"> elements (like id="__NEXT_DATA__"). The initial text/attribute sweep TreeWalker previously only extracted from application/ld+json scripts.
**Action:** Added application/json to the TreeWalker script type filter so embedded URLs are properly found.

## 2026-08-30 - False positives from commas inside srcset URLs
**Learning:** `pickBestFromSrcset` naively split on `,`, breaking on image URLs with commas (like CDN query parameters `?crop=10,20`). The second half of the query string would parse as an invalid URL fragment and bypass filters, flooding the UI with broken entries.
**Action:** Replace naive `split(',')` with a standard-compliant character scanner that parses URLs and descriptors separately, respecting commas inside URLs as long as they are not followed by a space and a valid descriptor.

## 2026-08-31 - Missed Site Icons and Secure OG Images
**Learning:** The `collectImages` and `handleMeta` handlers only targeted `og:image`, `twitter:image`, and `preload` hints. Site logos (`link[rel="icon"]`, `link[rel="apple-touch-icon"]`, `link[rel="shortcut icon"]`), as well as `og:image:secure_url` and `image_src`, were systematically ignored, omitting these frequently downloaded images from the grid.
**Action:** Expanded the initial DOM queries in `collectImages` and the MutationObserver tags in `handleMeta` to explicitly capture these additional metadata URLs. Note the `≥ 200×200` size filter still applies, so 16/32px favicons are probed and dropped; the win is large PWA icons (`512×512`) and `apple-touch-icon`s that survive it.

## 2026-09-03 - Missed JSON-LD in head tag
**Learning:** The text/attribute sweep TreeWalker previously started its scan from `document.body`, completely missing `application/ld+json` and `application/json` `<script>` tags placed in the `<head>` of the document.
**Action:** Change the TreeWalker root from `document.body` to `document.documentElement` to ensure the `<head>` tag is included in the regex sweep.
