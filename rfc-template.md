# ⛏️ Prospector RFC: Extracting media from HTML `<template>` elements

## The structural gap (why the existing pipeline misses this)

The `imgsnag` pipeline currently relies on DOM traversal tools like `document.images`, `document.querySelectorAll()`, `document.createTreeWalker()`, and `MutationObserver` to find media.

However, HTML `<template>` elements do not render their contents into the live DOM. Instead, their contents are parsed into an inert `DocumentFragment` held in the template's `.content` property. **Because this fragment is disconnected from the main document, standard DOM APIs (`querySelectorAll`, `TreeWalker`, `document.images`) completely ignore its contents.**

This means that any media (images, videos, or stylized elements) nested inside a `<template>` is completely invisible to the extension's structural and regex sweeps.

Real-world evidence:
1. **Web Components and Shadow DOM**: Custom elements often stamp out their initial DOM from a `<template>` tag. The template itself sits in the Light DOM waiting to be cloned, but its contents are opaque to `imgsnag` until the component hydrates.
2. **Client-side rendering (CSR) frameworks**: Libraries like Vue or lightweight vanity gallery scripts often embed raw gallery items inside `<template>` tags (e.g. `<template id="gallery-item"><img src="..."></template>`) to prevent the browser from eagerly fetching images until they are instantiated via JS.

## The Mechanism

To capture media inside templates, the pipeline must explicitly query for `<template>` elements and manually traverse their inert `.content` fragments.

```javascript
// Throwaway prototype sketch:
const templateImages = new Set();
const templateVideos = new Set();
document.querySelectorAll('template').forEach(t => {
  t.content.querySelectorAll('*').forEach(el => {
    // Re-use existing extractors
    handleImg(el, templateImages);
    handleVideo(el, templateImages, templateVideos);
    // Explicitly parse inline styles (getComputedStyle fails here)
    const bgUrls = getCssMediaUrls(el, false);
    bgUrls.forEach(url => templateImages.add(url));
  });
});
```

### Constraints on Inert Fragments
Because the fragment is inert, certain assumptions in the current pipeline break:
1. **Size measurement**: `naturalWidth` and `naturalHeight` on `<img>` elements inside a template are immediately `0` because the browser has not initiated network requests for them. Any size validation must rely on explicitly assigned `width`/`height` DOM attributes or be entirely deferred to the background network probing mechanism (`filterImagesBySize`).
2. **CSS styles**: `getComputedStyle()` returns empty/default values for elements not connected to the live DOM or stylesheets. CSS background images inside templates can only be discovered by parsing inline `style` attributes, not by computing cascading styles.
3. **`el.src` resolution**: Similar to `<noscript>` extraction, `el.src` on inert elements might not resolve correctly against the document's `<base>` if evaluated naively; reading raw attributes and passing them through `resolveUrl(val)` is preferred.

## Warden section (Security & Store Review)
- **Attack surface**: Minimal. The contents of `<template>` elements are already parsed by the browser's HTML parser. Extracting URLs from them uses the same safe attribute-reading and regex functions (`handleImg`, `resolveUrl`) that we use on the live DOM.
- **Protocol/Origin implications**: Same as the rest of the extension. `resolveUrl` enforces protocol restrictions (`http:`, `https:`, `blob:`, `data:`).
- **Store review risk**: Low. No new permissions, no new external network requests (other than standard network probes for sizing, which already happen).

## Feather section (Performance & Cost)
- **Cost budget**: Traversing `<template>` contents requires additional `querySelectorAll('*')` calls per template on the page. On a typical page without templates, the cost is `querySelectorAll('template')` returning empty (0 ms). On pages with heavy template usage, iterating the fragment adds CPU cost.
- **Hot-path impact**: Due to the iteration cost, sweeping `<template>` contents should ideally be done during the on-demand phase (e.g., popup connect, similar to `<noscript>` and `<svg>`) rather than on every `MutationObserver` tick, to avoid tanking scroll performance if a page dynamically inserts many templates.

## False-positive story
The primary risk of extracting media from `<template>` elements is surfacing placeholder or generic UI assets (like "loading" spinners or default avatars) that the site author intended to clone dynamically but hasn't yet. These are typically small and will be filtered out by the existing `≥200x200` size filter during the background network probe.

## Verdict: GO

**Stage 1 (Scout)**: Implement template extraction during the initial scan or on popup connect (similar to `collectNoscriptImages`). Traverse `document.querySelectorAll('template')`, iterate over their `.content`, and extract URLs using existing `handleImg`, `handleVideo`, etc., ensuring we rely on raw attributes rather than resolved IDL properties where possible. Use the deferred network sizing queue to validate image sizes since `naturalWidth`/`naturalHeight` won't be available.
