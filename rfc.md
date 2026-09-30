# ⛏️ Prospector RFC: Same-origin iframe descent

## The Gap
Web pages occasionally embed media inside same-origin `<iframe>`s (e.g., legacy CMS media managers, WYSIWYG editor previews, or enterprise portal widgets). Currently, imgsnag's content script only runs in the top-level browsing context (as `all_frames: true` is intentionally omitted from the manifest). Consequently, any media inside these iframes is entirely invisible to our extraction pipeline.

We could fix this by adding `"all_frames": true` to the manifest, but that would force the browser to inject our content script into every cross-origin ad network, tracking pixel, and social embed iframe on every page the user visits. This would be a massive, unacceptable performance regression.

By manually descending into same-origin iframes from the top-level content script, we can recover this media cleanly.

**Real-world evidence:**
- Legacy forum software (like older vBulletin or phpBB setups) often use same-origin iframes for rich-text attachment previews.
- Documentation portals and enterprise dashboards often embed sub-pages via same-origin iframes to preserve separate layout contexts, completely hiding their images from our top-level sweep.

## Mechanism
1. During `initialScan()`, after scanning the top document, query all `iframe` elements.
2. Attempt to access `iframe.contentDocument`. This must be strictly wrapped in a `try/catch` block, as the browser will throw a synchronous `SecurityError` for cross-origin frames.
3. If successful, run the existing DOM sweep (`collectImages`, `collectVideos`, TreeWalker regex sweep) using `iframe.contentDocument` as the root instead of the global `document`.
4. Attach a `MutationObserver` to the iframe's `body` to catch dynamically loaded media within the frame.
5. **Critical correctness detail:** Extracted URLs must be resolved against `iframe.contentDocument.baseURI`, not the top-level `document.baseURI`, to correctly respect any `<base>` tags inside the iframe.

## Warden Section
- **Permissions:** No new manifest permissions or `webRequest` intercepts are required. Same-origin `contentDocument` access is naturally permitted by the browser's same-origin policy, which our top-level `<all_urls>` injection respects.
- **Attack Surface:** The primary risk is mishandling exceptions when accessing `contentDocument`, which would crash the extension on pages with cross-origin embeds (e.g., YouTube or Stripe iframes). The `try/catch` block is a hard requirement. Furthermore, correctly scoping `baseURI` prevents relative URL spoofing if an attacker controls the iframe's `<base>` tag.
- **Store Review Risk:** Zero. We are using standard, synchronous DOM APIs without elevating privileges or executing remote code.

## Feather Section
- **Cost Budget:** The alternative (`all_frames: true`) would multiply our execution cost by the number of iframes on a page. Our manual descent approach costs exactly one `querySelectorAll('iframe')` and a fast-failing property access for cross-origin frames.
- **Hot Path:** The traversal cost only scales with the number of *same-origin* iframes on the page. For the vast majority of modern pages (where iframes are mostly cross-origin ads), the cost is negligible.

## False-Positive Story
Because we are simply pointing the existing extraction pipeline at a new DOM root, the false-positive profile is identical to the top-level document. Small UI icons or tracker pixels inside the iframe will still be caught and discarded by our existing `SIZE_PROBE_POOL_SIZE` limits and the `>= 200x200` dimension filter.

## Verdict
**GO**. Staged.

## Implementation Sketch
**Stage 1 (Scout):**
- Update `resolveUrl` to accept an optional `baseURI` parameter, falling back to `document.baseURI`.
- Refactor `collectImages`, `collectVideos`, and `extractRegexUrls` (the TreeWalker) to accept a `rootNode` (or `doc`) parameter instead of hardcoding global `document`.
- Add an `exploreIframes()` function that iterates over `document.querySelectorAll('iframe')`, tries to read `contentDocument`, and if successful, runs the sweeps and sets up a `MutationObserver` on the iframe's DOM.
