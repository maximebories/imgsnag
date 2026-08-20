# ⛏️ Prospector RFC: Shadow DOM traversal

## Gap
Open shadow roots (`node.shadowRoot`) hide their internal DOM from standard light-DOM queries (like `querySelectorAll` and the standard `TreeWalker`). This blinds our pipeline to media embedded within Web Components.
Evidence:
- MDN Web Docs (`https://developer.mozilla.org/en-US/`) hides 3 author/contributor images inside shadow roots.
- Shoelace Avatar Component (`https://shoelace.style/components/avatar`) hides 6 avatar images.

## Mechanism
We can capture these by traversing the document to find any element with a `shadowRoot`, and recursively executing our standard URL extraction on that root. A dedicated `TreeWalker` looking only for elements (to check `.shadowRoot`) is extremely efficient.

```javascript
function extractShadowMedia(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null, false);
    let node;
    while ((node = walker.nextNode())) {
        if (node.shadowRoot) {
            // extractUrlsFromElement(node.shadowRoot, ...)
            extractShadowMedia(node.shadowRoot);
        }
    }
}
```

## Warden section
**Security impact:** None. We are applying the exact same allow-list logic and size filters to the shadow DOM as we do the light DOM. This does not require any new manifest permissions or introduce new attack surfaces. Closed shadow roots (`mode: 'closed'`) remain inaccessible, which respects intended browser boundaries.

## Feather section
**Performance impact:** Minimal. A `TreeWalker` with `NodeFilter.SHOW_ELEMENT` executing over a complex page (like MDN) and checking for `.shadowRoot` takes ~0.2ms. It only recurses when an open shadow root is found.

## False-positive story
Any garbage surfaced by this channel is subject to the exact same URL and size filtering as light DOM images. The context is still HTML elements, just in a different tree.

## Recommendation: GO
**Implementation Sketch (for Scout):**
Add a recursive shadow DOM walker to `initialScan` and the `MutationObserver` handler in `src/content.js`. Pass `node.shadowRoot` back into `extractUrlsFromElement` or `collectImages`.
