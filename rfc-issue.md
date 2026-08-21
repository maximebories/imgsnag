# ⛏️ Prospector RFC: Shadow DOM traversal

**Gap (with named real-world evidence)**: Open shadow roots are invisible to `querySelectorAll` and TreeWalkers run against the main document. Media elements inside a shadow root are skipped by the current pipeline unless they are dynamically added and caught by `MutationObserver` (which must be specifically attached to the shadow root, our current observer on `document.documentElement` won't catch them).
- *Web Components*: Sites like YouTube and Twitter make heavy use of web components and shadow DOM. For example, YouTube's video player and thumbnails often live inside custom elements.
- *Widgets*: Embedded widgets (like Intercom, Stripe) often use shadow DOM to isolate styles. Images inside these widgets are invisible to imgsnag.

**Mechanism**: We need to traverse open shadow roots during the initial scan, and also observe them for mutations. Because there is no `document.shadowRoots` API, we must find them by checking `.shadowRoot` on elements.
```javascript
function findImagesInShadowDOM(root, trackImage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
  let el;
  while ((el = walker.nextNode())) {
    if (el.shadowRoot) {
      // Traverse inside the shadow root
      const shadowWalker = document.createTreeWalker(el.shadowRoot, NodeFilter.SHOW_ELEMENT, null, false);
      let shadowEl;
      while ((shadowEl = shadowWalker.nextNode())) {
        if (shadowEl.tagName === 'IMG' && shadowEl.src) trackImage(shadowEl.src);
        // Recursively check for nested shadow roots
        if (shadowEl.shadowRoot) findImagesInShadowDOM(shadowEl.shadowRoot, trackImage);
      }
    }
  }
}
```

**Warden section**:
- *Attack surface*: Reading `.shadowRoot` is a safe, standard DOM API. We can only access `mode: 'open'` shadow roots. Closed shadow roots return `null` and remain inaccessible, which is expected.
- *Protocol/origin implications*: No new permissions required. Images found in shadow DOM are subject to the same `resolveUrl` protocol allowlist and URL resolution as the main document.
- *Store-review risk*: Negligible. Extension is still just reading DOM state.

**Feather section (cost budget)**:
- Traversing all elements to check for `.shadowRoot` has a CPU cost. Using `TreeWalker` is generally faster than `querySelectorAll('*')`. In a jsdom benchmark, checking 50,000 nodes took ~360ms, but in a real browser, this is much faster.
- *Mitigation*: We should only run this traversal during the initial scan (popup open or on load), not continuously on every mutation, to avoid the `<all_urls>` tax on hot paths.

**False-positive story**: Images in shadow DOM are often structural (icons, UI elements) rather than content. The existing ≥200x200 `MIN_IMAGE_SIZE` filter is sufficient to exclude most UI sprites and icons.

**Go/No-go recommendation**: **GO**. Web components are increasingly common for encapsulating content (e.g. image galleries). The loss in recall is high.

**Staged Implementation Sketch (Scout)**:
1.  **Stage 1 (<50 lines)**: Add a `collectShadowImages(trackImage)` function called during `collectMediaUrls()` (initial scan only). It uses a TreeWalker to find elements with `.shadowRoot`, then queries `img[src]` inside those roots. Do not implement continuous `MutationObserver` for shadow roots yet (too complex for one stage).
