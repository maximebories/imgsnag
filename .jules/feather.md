## 2026-07-23 - Expensive DOM read in async filter map
**Learning:** Calling `document.querySelector` repetitively inside a `.map` loop to find image sizes based on URLs causes severe DOM scanning overhead and potential layout thrashing. When scaling to many URLs (e.g. 500 urls on a page with 2000 images), it takes several seconds.
**Action:** When filtering or mapping URLs, build a cache (`Map`) of `document.images` once in $O(N)$ time. Then perform $O(1)$ lookups. This transforms $O(N \times M)$ overhead into $O(N + M)$, speeding up the operation by ~5-10x. Always fallback to the original query if the map misses.
## 2026-08-15 - Lazy evaluate getComputedStyle for background images
**Learning:** Calling `getComputedStyle(el).backgroundImage` synchronously for thousands of elements during the MutationObserver loop causes severe main thread blocking (~3.7s on heavy pages with 10k elements).
**Action:** Introduced a `requestIdleCallback` queue to batch background image style resolutions during browser idle periods, falling back to `setTimeout`. Queue is immediately flushed if the popup connects to prevent discovery regressions.
## 2026-08-15 - Inline-style fast path before getComputedStyle (discovery only)
**Learning:** Elements with an inline `background-image` (common in lazy-load galleries) can be read via `el.style.backgroundImage` without forcing a computed-style resolution. Orchestrator review restricted this to the discovery paths: on the Alt+Click download path, inline style can diverge from the rendered image (stylesheet `!important` overrides), so display-accurate paths keep `getComputedStyle`.
**Action:** Prefer `el.style.backgroundImage` with a `getComputedStyle` fallback in discovery loops; never substitute it where the user downloads what they see.
## 2026-08-16 - Expensive live HTMLCollection iteration
**Learning:** Iterating over `document.images` and accessing its `length` property directly inside a `for` loop condition is very expensive on large pages because `document.images` is a live `HTMLCollection`. Accessing it forces layout or collection recalculations.
**Action:** Cache the collection and its length in local variables (`const imgs = document.images; const len = imgs.length;`) before the loop to convert an $O(N^2)$ operation into $O(N)$, significantly speeding up `sizeMap` generation.
## 2026-08-19 - Expensive Array.from and join in attribute scan
**Learning:** Iterating over `Node.ELEMENT_NODE` attributes by collecting them into an array via `Array.from(node.attributes).map(...).join(' ')` causes excessive memory allocation and string concatenation overhead, especially on heavy pages, which can take over 1.3s on large pages.
**Action:** Replace `Array.from` and `join` with a direct `for` loop over `node.attributes` and apply the regex on each attribute value directly. This reduces the overhead significantly (~2x faster).
## 2026-08-22 - Duplicated live DOM collection iterations
**Learning:** Constructing a sizeMap by iterating the live `document.images` collection twice within the same event loop (once in `filterImagesBySize`, once in `addNewUrls`) causes redundant collection scanning on heavy pages (~100ms to ~1.6s observed).
**Action:** Hoist the map generation to the top of `addNewUrls` and pass it by reference into the filter function so the live collection is walked once.
## 2026-08-25 - Regex fast-path for URL extraction
**Learning:** Applying complex regular expressions (like URL extractors) across thousands of DOM text nodes or attributes is CPU-intensive. By implementing a fast-path pre-check (`.includes('http')`), we can bypass the regex engine entirely for the vast majority of non-matching strings, yielding significant main-thread CPU savings.
**Action:** When applying regular expressions to search for URLs over large numbers of DOM strings (text nodes or attributes), implement a fast-path pre-check (e.g., `.includes('http')`) before executing the regex to bypass the engine for non-matching strings.
## 2026-08-15 - Inline-style fast path before getComputedStyle (discovery only)
**Learning:** Elements with an inline `background-image` (common in lazy-load galleries) can be read via `el.style.backgroundImage` without forcing a computed-style resolution. Orchestrator review restricted this to the discovery paths: on the Alt+Click download path, inline style can diverge from the rendered image (stylesheet `!important` overrides), so display-accurate paths keep `getComputedStyle`.
**Action:** Prefer `el.style.backgroundImage` with a `getComputedStyle` fallback in discovery loops; never substitute it where the user downloads what they see.
## 2026-08-27 - Regex fast-path logic fix
**Learning:** Applying a fast path like `.includes('http') || regex.test(str)` fails to bypass the regex for non-matching strings because the `||` operator falls through to the regex when the first condition is false (which is true for most DOM nodes). This actually degrades performance by adding overhead before running the regex anyway.
**Action:** When implementing a fast-path pre-check, ensure it returns `false` to short-circuit the execution, such as `(str.includes('http') || str.includes('HTTP')) && regex.test(str)`. This successfully bypasses the regex engine entirely for non-matching strings.
