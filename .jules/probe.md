## 2026-08-15 - Protocol allowlisting regression test
**Learning:** Found a journal-documented security fix from the Warden persona regarding protocol allowlisting in `resolveUrl` that did not have a corresponding regression test in the suite. Added a test ensuring `javascript:`, `file:`, and `ftp:` protocols are properly rejected to protect this trust boundary.
**Action:** Always verify that security fixes documented in journals are paired with tests in the codebase.

## 2026-08-16 - Parser differential regression test
**Learning:** Found a journal-documented security fix from the Sentinel persona regarding parser differentials in `src/background.js` (passing raw strings instead of normalized `urlObj.href` to `browser.downloads.download()`) that lacked a corresponding regression test.
**Action:** Always verify that URL parser differential fixes are pinned with regression tests that assert the final downloaded URL is strictly the normalized output of the URL parser, not the raw input.

## 2026-08-18 - Synthetic Events Testing
**Learning:** Verified that the `e.isTrusted` check implemented by Warden protects the click and dragend listeners in `src/content.js`. However, testing `e.isTrusted` in jsdom requires intercepting `document.addEventListener` since standard synthesized events cannot easily have `isTrusted` overridden as true.
**Action:** Added `tests/trust_boundaries.test.js` to pin the `e.isTrusted` checks for alt-click and drag-to-save behavior, making sure these boundaries remain guarded against regression.

## 2024-08-08 - Badge Clear Parity Regression Test
**Learning:** Verified that the badge clearing fallback logic (`text: null` failing with a rejected promise causing a retry with `text: ''`) implemented by the Twin persona to resolve Chrome vs Firefox differences was present in the source but lacked a regression test.
**Action:** Added a regression test asserting that Chrome's TypeError throwing behaviour appropriately falls back to clearing the badge with `''`, ensuring cross-browser API parity remains guarded.
