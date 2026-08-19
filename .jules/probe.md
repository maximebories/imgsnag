## 2026-08-15 - Protocol allowlisting regression test
**Learning:** Found a journal-documented security fix from the Warden persona regarding protocol allowlisting in `resolveUrl` that did not have a corresponding regression test in the suite. Added a test ensuring `javascript:`, `file:`, and `ftp:` protocols are properly rejected to protect this trust boundary.
**Action:** Always verify that security fixes documented in journals are paired with tests in the codebase.

## 2024-05-25 - Synthetic Events Testing
**Learning:** Verified that the `e.isTrusted` check implemented by Warden protects the click and dragend listeners in `src/content.js`. However, testing `e.isTrusted` in jsdom requires intercepting `document.addEventListener` since standard synthesized events cannot easily have `isTrusted` overridden as true.
**Action:** Added `tests/trust_boundaries.test.js` to pin the `e.isTrusted` checks for alt-click and drag-to-save behavior, making sure these boundaries remain guarded against regression.
