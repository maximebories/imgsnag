
# ⛏️ Prospector RFC: `<template>` contents extraction

## The Gap

The current media extraction pipeline structurally misses media hidden within `<template>` elements. The TreeWalker and `querySelectorAll('*')` sweeps only traverse the live DOM tree. However, `<template>` elements instantiate an inert `DocumentFragment` attached to their `.content` property, which is completely disconnected from the live DOM and invisible to standard traversal.

Modern single-page applications and web components heavily utilize `<template>` tags to hold UI fragments, product swatches, gallery lightboxes, and list items until they are instantiated. Any media hardcoded in these templates drops out of our pipeline, and users are forced to manually trigger instantiation (e.g., clicking on every swatch) to surface the images.

**Real-world evidence:**
1. **Web Components / Shoelace / Polymer-based sites:** Components defined using templates hide their default images.
2. **E-commerce Product Swatches:** E-commerce platforms like Shopify themes often pre-load high-res gallery images inside `<template>` tags corresponding to different color variants, instantiating them only on click.

## Mechanism & Prototype

We can extract these URLs by querying the `.content` property of each `<template>` tag and applying our standard extraction logic to the inert `DocumentFragment`.

```javascript
function collectTemplateMedia() {
  const imageUrls = new Set();
  const videoUrls = new Set();

  document.querySelectorAll('template').forEach(tpl => {
    // Traverse the inert DocumentFragment
    tpl.content.querySelectorAll('*').forEach(el => {
      // Re-use existing extractUrlsFromElement logic for imgs, sources, etc.
      // e.g. handleImg(el, imageUrls);
    });
  });

  return { imageUrls, videoUrls };
}
```

## 🛡️ Warden Section (Security & Review Risk)

* **Attack Surface:** Extracting from `.content` involves inert elements. The browser does not execute scripts or dispatch network requests for `src` attributes within an inert `DocumentFragment`. This is inherently safer than live DOM manipulation.
* **Protocol/Origin Implications:** Relative URLs found within the template still need to be resolved via `resolveUrl()`, which will correctly use the page's `document.baseURI`. No new origin risks are introduced.
* **Store-Review Risk:** Negligible. We are simply querying a standard DOM property (`HTMLTemplateElement.content`) using existing read-only extraction methods.

## 🪶 Feather Section (Performance & Cost Budget)

* **Hot-path Impact:** Iterating over `<template>` elements is extremely fast. However, applying `getComputedStyle` to elements inside an inert `DocumentFragment` throws or returns empty styles. The extraction logic must bypass computed styles for template contents and rely purely on inline `style` attributes (e.g., `el.getAttribute('style')`).
* **Cost on Pages Without Templates:** A single `document.querySelectorAll('template')` query is practically instantaneous (~0.1ms). The cost is effectively zero when no templates are present.
* **Network Cost:** Because templates are inert, the browser hasn't fired network requests for their `src` attributes. This means programmatic `naturalWidth` and `naturalHeight` checks will immediately yield `0`. Size validations must be deferred to the existing network probe mechanism (`pendingNetworkFilter`).

## The False-Positive Story

The primary risk is capturing placeholder media or default avatars that are never actually rendered on the page. Because these elements are inert, we cannot measure their rendered size to filter out 1x1 tracking pixels or tiny icons.

* **Mitigation:** The existing size filter already handles URLs with a 0x0 `naturalWidth` by deferring them to the `pendingNetworkFilter` network probe when the popup connects. Placeholder garbage will still be culled by the 200x200 pixel threshold after the network fetch.

## Verdict: GO

This channel represents a significant structural gap in modern web apps and is very cheap to close.

## Implementation Sketch (Stage 1 - Scout)

1. Add a `collectTemplateImages()` pass in `src/content.js` (or integrate it into `collectMediaUrls()`).
2. Select all `<template>` elements and traverse their `.content.querySelectorAll('*')`.
3. Apply existing handlers (`handleImg`, `handleSrcset`, `handleSource`, `handlePicture`) to the inert nodes.
4. **Crucial Constraints:**
   - Resolve URLs using `document.baseURI` (via the existing `resolveUrl`).
   - Do not apply `getComputedStyle` (it does not apply to inert elements). Extract `background-image` directly from the raw `style` attribute string.
   - Rely on the existing `pendingNetworkFilter` for size validation, as `naturalWidth`/`naturalHeight` are 0 for inert images.
