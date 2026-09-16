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

## 2026-08-29 - getDomImageSize Tracking Pixel Guard Regression Test
**Learning:** Verified that the Scout persona's fix for rejecting 1x1 tracking pixels passing the size filter via `srcset` lacked a dedicated regression test. The fix in `getDomImageSize` guards against assigning a rendered `srcset` candidate's large natural dimensions to a sibling tracking pixel by checking `activeUrl === url`.
**Action:** Added a regression test for `getDomImageSize` in `src/content.test.js` pinning the behavior that it only returns natural dimensions if the queried URL matches the actively rendered URL (`currentSrc`), guarding against silent regressions that would bloat the grid with tracking pixels.

## 2026-08-30 - application/json data in Script tags regression test
**Learning:** Verified that the Scout persona's fix to extract image URLs from `<script type="application/json">` elements (like Next.js state blocks) using the TreeWalker lacked a regression test.
**Action:** Added a regression test in `tests/redos_fallback.test.js` to pin the TreeWalker's extraction of URLs from `application/json` script blocks, ensuring they are not filtered out.

## 2026-09-03 - Shortcut Hint UI State Test
**Learning:** Verified that the Pixel persona's fix for correctly applying the shortcut hint (`Ctrl+Enter`/`Cmd+Enter`) only to the active button in the popup (either 'Download Selected' or 'Download All') lacked a regression test.
**Action:** Added a regression test `tests/popup_shortcut.test.js` to pin the UI state updates in `updateCounter`, ensuring the tooltip hint dynamically moves to the correct active button based on selection state, and exposed internal states (`updateCounter`, `allUrls`, `selectedUrls`) via `module.exports` for testability.

## 2026-09-03 - Centralized download URL validation regression test
**Learning:** Found a journal-documented security enhancement from the Warden persona (Centralized download URL validation) that lacked regression tests. The extension normalizes URLs to avoid parser differentials and rejects non-allowlisted protocols before triggering downloads.
**Action:** Always verify that security fixes related to centralized URL validation are pinned with regression tests that explicitly assert the final download API receives the normalized `urlObj.href` string (not the raw input) and rejects un-allowlisted protocols (`javascript:`, `file:`, `data:`, `blob:`), even if `content.js` allows them for its own logic. Also pinned the behavior that bulk download badge counts only track valid URLs post-filtering.

## 2026-09-06 - Missed Lazy Loaded Videos regression test
**Learning:** Verified that the Scout persona's fix for extracting lazy-loaded video URLs and video poster URLs (from attributes like `data-src`, `data-lazy-src`, `data-original`, and `data-poster`) in `handleVideo` lacked a regression test. Additionally, `handleVideo` was not exposed via `module.exports`, making it untestable in isolation.
**Action:** Added `handleVideo` to `module.exports` and added a regression test in `tests/content.test.js` to ensure the correct extraction of video URLs into the `videoSet` and poster URLs into the `imageSet`, protecting against regressions that would cross these sets or miss lazy-loaded attributes.

## 2026-09-08 - JSON-LD and application/json in <head> regression test
**Learning:** Verified that the Scout persona's fix for capturing `application/ld+json` and `application/json` `<script>` tags placed in the `<head>` of the document (by changing the TreeWalker root from `document.body` to `document.documentElement`) lacked a regression test targeting the `<head>` specifically.
**Action:** Added a regression test in `tests/redos_fallback.test.js` appending these scripts and a `<style>` block to `document.head` to assert that `collectMediaUrls` correctly extracts image URLs from the JSON scripts while appropriately ignoring the style block.

## 2026-09-10 - Mocking global URL in Node/Jest
**Learning:** Overwriting the `global.URL` constructor entirely in Jest breaks assumptions when other code invokes `new URL()` — and `background.js` does exactly that when it re-validates download URLs.
**Action:** When mocking static methods like `URL.createObjectURL` and `URL.revokeObjectURL`, stub the methods directly and restore them in `afterEach` rather than replacing the `global.URL` object.

## 2026-09-10 - Semantic parity in download_svg browser forks
**Learning:** Twin's journal notes that the `download_svg` blob-vs-`data:` fork is semantically sound (2 MB cap, teardown handling in Firefox event pages). But a review conclusion is not a regression guard: nothing failed if the blob branch silently stopped revoking.
**Action:** Pinned both forks in `test/background.test.js` — `createObjectURL` present asserts a `blob:` URL plus exactly one `revokeObjectURL` on `downloads.onChanged` (and one immediate revoke when `downloads.download` rejects); `createObjectURL` absent asserts the `data:image/svg+xml` fallback and *no* revoke. Added a companion test that an `interrupted` download still clears its `dl_<id>` storage key.

## 2026-09-11 - Pinned download_svg boundaries
**Learning:** Verified that the strict `<svg` prefix validation (rejecting legitimate well-formed SVGs starting with `<?xml` or `<!DOCTYPE`) and the 2MB size boundary in `src/background.js` `download_svg` lacked exact tests. These are hard invariants guarding the extension from oversized or unexpected payloads crossing the page-to-background boundary.
**Action:** Added two sets of tests in `test/background.test.js`: one to strictly assert the fail-closed prefix rejection of `<?xml` and `<!DOCTYPE`, and another to explicitly pin the exact `MAX_INLINE_SVG_CHARS` size boundary (2 * 1024 * 1024 bytes). Since `src/background.js` has no `module.exports`, the size boundary test was written by asserting against the literal constant with a comment pointing back to `src/background.js:13` as the source of truth—this serves as a pattern for future Probe runs testing background internals.
**Orchestrator note — why this is not a duplicate of the test above it.** `rejects payloads that are not SVG markup` already existed and already fed the validator an oversized payload, so at a glance this looks like re-covered ground. It is not: that test uses `'<svg'.padEnd(2 * 1024 * 1024 + 5, 'a')`, which is *five over* the cap. A test that only probes far past a boundary cannot fail when the boundary itself moves by one — flip `>` to `>=` in `src/background.js:126` and the old test stays green. The new pair asserts `length === MAX_INLINE_SVG_CHARS` accepted and `length === MAX_INLINE_SVG_CHARS + 1` rejected, which is the pair that actually pins the comparison operator. **The generalizable rule: when a limit is a number, test at the number, not near it.** The same reasoning is why the `<?xml` case matters — it is a *well-formed* SVG that the validator deliberately rejects, so it pins an intentional false-negative that a future "bug fix" would otherwise quietly relax.

## 2026-09-12 - Duplicate-check before writing a regression test (PR #254, closed)
**Learning:** Wrote a regression test for `collectInlineSvgs` rejecting namespace-prefixed `<use>` refs. The coverage already existed in `src/content.test.js` — and was stronger, exercising `<some_use.x:use>` (the full XML name charset that `[^>\s:]+` was written for) where the new fixture used only `<foo:use>`. Warden's journal does not mention the tests, which is what made the gap look real; but **on this repo a fix and its regression guard land in the same commit as a rule**, so "Warden fixed X" is a strong prior that X is already tested, not an invitation to fill a gap.
**Action:** Run the duplicate check in step 3 of the AGENTS.md protocol *before* writing the fixture, not after — one `grep -rn collectInlineSvgs` across the test directories would have settled it. When a journal records a fix but not a test, check the commit that landed the fix rather than inferring absence.
**Orchestrator note — the test itself was sound, and that is the part worth keeping.** It was verified before rejection: weakening the guard to `/<use\b/i` made it fail alongside the two existing tests, so it was a real pin, not a fixture that passes for the wrong reason. That is a higher bar than most regex regression tests clear, and the habit is correct even though this instance was redundant. The failure was entirely in the duplicate check upstream of it. **Verify your test can fail before you defend it; verify nobody already wrote it before you write it.**

## 2026-09-14 - Trust boundary regression test asymmetry
**Learning:** Found that the test suite (`test/background.test.js`) only verified the *deny* branch of Warden's "Restrict Popup-Only Actions" fix (asserting that `sender.tab` rejection works), but lacked a corresponding test asserting that the *allow* branch successfully resolves these popup actions when the sender is trusted (`sender` is undefined, or `sender.tab` is undefined). A security boundary without tests for both its accept and reject conditions can silently regress its core functionality.
**Action:** Pinned the *allow* behavior in `test/background.test.js`, confirming that `download_images_bulk`, `download_svg`, and `cancel_downloads` are successfully accepted and have the expected effect when invoked by a trusted sender (i.e. the popup itself). Ensure security boundaries test both the allow and deny states.
**Orchestrator note — the test is exactly what was approved, and it asserts effects rather than absence of rejection.** Each of the three actions checks something observable (the download lands, the filename is `imgsnag-inline.svg`, cancel resolves) instead of merely asserting "not `Unauthorized sender`", which is what makes it a pin on the allow branch rather than a restatement of the guard at `src/background.js:67`. Landed as-is.
**What did not land: the rest of the branch.** The branch was cut from a `main` that predated the Scout imagesrcset (`761fbc8`) and Pixel dark-mode (`21afe95`) landings, so its diff against current `main` re-proposed both — a three-dot diff makes an untouched file look like your contribution. Only `test/background.test.js` and this entry were taken across. Check with `git diff origin/main..HEAD` (two dots) before you publish: two dots answers "how does my tip differ from main *now*", three dots answers "what happened since I branched", and only the first is the review surface. If two-dot shows files your session never opened, rebase before pushing.

## 2026-09-17 - isImageUrl Edge Case and Validation Regression Test
**Learning:** Verified that the exported helper `isImageUrl` (which checks if a URL points to an image based on `IMAGE_EXT_RE` or `data:image/`) lacked comprehensive regression tests. It is essential to guarantee that non-image URLs, invalid parsing cases, and edge cases (like `.pdf?bar.jpg` or `malicious.jpg.pdf`) are explicitly rejected, protecting the downstream tracking logic from parsing garbage or non-media URLs.
**Action:** Added a `describe('isImageUrl')` block in `tests/content.test.js` to ensure the function rejects malicious URL structures, handles invalid strings gracefully via its `try-catch`, and correctly extracts extensions directly from the URL pathname.

## 2026-09-17 - collectVideos initial scan Open Graph type guards regression test
**Learning:** Verified that the Scout persona's fix for checking Open Graph video metadata types (e.g. rejecting `text/html`) was well tested in the `handleMeta` path for the MutationObserver, but completely lacked tests for the initial scan entry point: `collectVideos`. A drift between the selector string and the type-selector keys would silently break the initial scan without failing any `handleMeta` guard test.
**Action:** Added regression tests in `tests/content.test.js` (within the `collectMediaUrls initial scan unified traversal` block) that set up `<meta>` tags in `document.head` and assert on the `videoUrls` returned by `collectMediaUrls()`: `text/html` typed tags are rejected, `video/mp4` typed extensionless tags are accepted, and untyped extensionless tags are rejected — covering the `collectVideos` caller.
**Orchestrator note — two sessions of yours landed together tonight and neither knew about the other.** This entry and the `isImageUrl` entry above it come from sibling runs (tasks `17569768742282766993` and `9116148530904595691`) that both edited the tail of `.jules/probe.md` and the middle of `tests/content.test.js`; the journal collided on cherry-pick and was union-merged. No harm done — the two test blocks are disjoint — but note the escaped backticks (`` \` ``) in the submitted entry, which render literally in Markdown. Journals are read by the next run of you; write them as Markdown, not as a shell-quoted string.
