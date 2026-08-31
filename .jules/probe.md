## 2026-08-15 - Protocol allowlisting regression test
**Learning:** Found a journal-documented security fix from the Warden persona regarding protocol allowlisting in `resolveUrl` that did not have a corresponding regression test in the suite. Added a test ensuring `javascript:`, `file:`, and `ftp:` protocols are properly rejected to protect this trust boundary.
**Action:** Always verify that security fixes documented in journals are paired with tests in the codebase.

## 2026-08-16 - Parser differential regression test
**Learning:** Found a journal-documented security fix from the Sentinel persona regarding parser differentials in `src/background.js` (passing raw strings instead of normalized `urlObj.href` to `browser.downloads.download()`) that lacked a corresponding regression test.
**Action:** Always verify that URL parser differential fixes are pinned with regression tests that assert the final downloaded URL is strictly the normalized output of the URL parser, not the raw input.

## 2026-08-18 - Synthetic Events Testing
**Learning:** Verified that the `e.isTrusted` check implemented by Warden protects the click and dragend listeners in `src/content.js`. However, testing `e.isTrusted` in jsdom requires intercepting `document.addEventListener` since standard synthesized events cannot easily have `isTrusted` overridden as true.
**Action:** Added `tests/trust_boundaries.test.js` to pin the `e.isTrusted` checks for alt-click and drag-to-save behavior, making sure these boundaries remain guarded against regression.
## 2026-08-20 - Meta and Preload regression test
**Learning:** Verified that the Scout persona's fix for capturing `meta[property="og:image"]`, `meta[name="twitter:image"]`, and `link[rel="preload"][as="image"]` lacked a regression test.
**Action:** Added `handleMeta` regression test in `tests/content.test.js` to ensure the correct extraction of meta and preload images.

## 2026-08-20 - Badge Clear Parity Regression Test
**Learning:** Found a journal-documented parity fix from the Twin persona regarding badge clearing (`browser.action.setBadgeText({ text: null })` vs `''`) that lacked a corresponding regression test.
**Action:** Always verify that cross-browser parity fixes (like badge clearing mechanisms) are pinned with regression tests that simulate browser-specific API failures (e.g., throwing on `null`) to ensure the fallback logic remains intact.
## 2026-08-22 - ReDoS TreeWalker regression test
**Learning:** The Warden-documented ReDoS fix (regex strip replaced by a native DOM TreeWalker) lacked a regression test.
**Action:** Added tests/redos_fallback.test.js pinning TreeWalker extraction from text nodes, attributes, and JSON-LD, and the rejection of URLs inside non-JSON-LD script and style blocks.
## 2026-08-25 - Storage-backed download tracking regression test
**Learning:** Verified that the Twin persona's fix for tracking download IDs in `browser.storage.local` using independent `dl_<id>` keys lacked a dedicated regression test asserting this exact behavior during bulk downloads and cancellation.
**Action:** Added a regression test in `test/background.test.js` to explicitly pin the `dl_<id>` storage writes and removals, guaranteeing that Service Worker state persistence is strictly maintained.
## 2026-08-24 - Missing CSS.escape mock in jsdom
**Learning:** Verified that testing DOM scanning logic like `MutationObserver` triggers `CSS.escape`, which is not available in standard `jsdom` environments, throwing a `ReferenceError: CSS is not defined`.
**Action:** Added a simple `global.CSS = { escape: (str) => str }` mock to `tests/setup.js` to avoid the `ReferenceError` when running DOM-dependent content tests.

## 2026-08-26 - handlePicture regression test
**Learning:** Scout's per-picture selection (one URL per <picture>, preferring img.currentSrc) had no regression test — it is the guard that keeps the grid from showing one cell per format variant.
**Action:** Added handlePicture tests in tests/content.test.js pinning currentSrc priority and the first-usable-source fallback. jsdom does not resolve currentSrc, so define it with Object.defineProperty.

## 2026-08-27 - CSS Masks and Pseudo-elements regression test
**Learning:** Verified that the Scout persona's fix for extracting media URLs from CSS pseudo-elements (like `::before` and `::after`) and modern mask properties (`mask-image`, `-webkit-mask-image`) lacked a regression test. Additionally, `getComputedStyle` throws 'Not implemented' for pseudo-elements in jsdom if not mocked or handled correctly. The function `getCssMediaUrls` also recently added an inline fast path when `useDisplayAccurate` is false.
**Action:** Added a regression test for `getCssMediaUrls` in `tests/content.test.js` to ensure the correct extraction of URLs from these extended CSS properties and pseudo-elements (mocking `getComputedStyle` appropriately), while also pinning the behavior of the `useDisplayAccurate` fast path.

## 2026-08-28 - SVG <image> embed capture test
**Learning:** Verified that the Scout persona's fix for extracting media URLs from embedded SVG images (`<image href="...">` and `<image xlink:href="...">`) using `handleSvgImage` lacked a regression test.
**Action:** Added a regression test for `handleSvgImage` in `src/content.test.js` to ensure the correct extraction of URLs from both `href` and `xlink:href` attributes.

## 2026-08-31 - application/json data in Script tags regression test
**Learning:** Verified that the Scout persona's fix for extracting media URLs from embedded `<script type="application/json">` elements lacked a regression test.
**Action:** Added a regression test for `application/json` extraction in `tests/redos_fallback.test.js` to ensure embedded application state URLs (like Next.js data) are properly found.
