## 2023-10-01 - Example
**Learning:** Example
**Action:** Example

## 2024-05-24 - Missed Lazy Loaded Images
**Learning:** Common lazy-loading attributes (`data-src`, `data-lazy-src`, `data-original`, and `data-srcset`) are missed by `PerformanceObserver` and standard `img[src]` DOM scans because they are not loaded by the browser network and their `src` attributes are placeholders (like `data:` URIs).
**Action:** Explicitly query `img[data-src]`, `img[data-lazy-src]`, `img[data-original]`, and `[data-srcset]` in DOM scanning functions (`collectMediaUrls` and `extractUrlsFromElement`), and adapt Alt+Click and Drag-to-save listeners to fall back to these attributes.
