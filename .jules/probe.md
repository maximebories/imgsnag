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
