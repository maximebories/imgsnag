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
## 2026-08-20 - TreeWalker Regex Sweep Allocation Overhead
**Learning:** Using `Array.from(node.attributes, ...).join(' ')` during the TreeWalker DOM sweep on elements creates significant memory allocation and garbage collection overhead, converting an efficient DOM collection into huge strings before running a regex.
**Action:** Iterate directly over `node.attributes` using a `for` loop and run the regex on each attribute's `value` individually. This prevents creating large strings and arrays, reducing CPU time by roughly ~25%.
