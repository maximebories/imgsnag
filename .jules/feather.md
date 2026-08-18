## 2026-07-23 - Expensive DOM read in async filter map
**Learning:** Calling `document.querySelector` repetitively inside a `.map` loop to find image sizes based on URLs causes severe DOM scanning overhead and potential layout thrashing. When scaling to many URLs (e.g. 500 urls on a page with 2000 images), it takes several seconds.
**Action:** When filtering or mapping URLs, build a cache (`Map`) of `document.images` once in $O(N)$ time. Then perform $O(1)$ lookups. This transforms $O(N \times M)$ overhead into $O(N + M)$, speeding up the operation by ~5-10x. Always fallback to the original query if the map misses.
## 2026-08-15 - Lazy evaluate getComputedStyle for background images
**Learning:** Calling `getComputedStyle(el).backgroundImage` synchronously for thousands of elements during the MutationObserver loop causes severe main thread blocking (~3.7s on heavy pages with 10k elements).
**Action:** Introduced a `requestIdleCallback` queue to batch background image style resolutions during browser idle periods, falling back to `setTimeout`. Queue is immediately flushed if the popup connects to prevent discovery regressions.
## 2026-08-15 - Inline-style fast path before getComputedStyle (discovery only)
**Learning:** Elements with an inline `background-image` (common in lazy-load galleries) can be read via `el.style.backgroundImage` without forcing a computed-style resolution. Orchestrator review restricted this to the discovery paths: on the Alt+Click download path, inline style can diverge from the rendered image (stylesheet `!important` overrides), so display-accurate paths keep `getComputedStyle`.
**Action:** Prefer `el.style.backgroundImage` with a `getComputedStyle` fallback in discovery loops; never substitute it where the user downloads what they see.
## 2026-08-18 - HTMLCollection iteration performance
**Learning:** Iterating over `document.images.length` and `document.images[i]` within a `for` loop condition scales poorly, effectively creating O(N^2) complexity because `document.images` is a live `HTMLCollection`. Testing demonstrated ~82ms uncached vs ~1ms cached for 1000 images.
**Action:** Cache the collection (`const images = document.images`) and its length (`const len = images.length`) into local variables prior to iterating to enable an O(1) property lookup and avoid layout thrashing.
