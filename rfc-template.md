# ⛏️ Prospector RFC: `<template>` Content Extraction

## The Gap
The current media discovery pipeline in `src/content.js` relies heavily on standard DOM traversal methods like `document.images`, `document.querySelectorAll`, and a `TreeWalker`. However, standard DOM traversal methods do not penetrate inert `<template>` elements. `<template>` elements are widely used by modern web frameworks (like Lit, Vue, and vanilla Web Components) to house reusable DOM fragments and localized UI blocks, often containing rich media (`<img>`, `<video>`, inline styles with background images) that remain hidden from the extension's structural and regex sweeps until actively cloned and attached to the DOM by the page.

While the page *may* eventually clone these templates into the active DOM (where our `MutationObserver` would catch them), many implementations hold lazy-loaded components or pre-fetched gallery items inside `<template>` tags. By reading directly into `template.content` (a `DocumentFragment`), we can surface media assets that structurally exist on the page but are invisible to our current tools. This allows us to discover assets ahead of the user interacting with them.

**Real-world evidence:**
1. A prototype script verified that `document.images` and `TreeWalker` both report `0` images when querying a document that contains an `<img>` purely inside a `<template>`.
2. Accessing `template.content.querySelectorAll('img, video, [style*="background"]')` successfully extracts the elements.

## The Mechanism
Standard API methods do not work on disconnected fragments within `<template>`.
Specifically:
- `getComputedStyle` throws or returns null on these disconnected elements.
- We must fall back to directly parsing `el.getAttribute('style')` for inline styles.

The mechanism involves:
1. Using `document.querySelectorAll('template')` to iterate through all template tags.
2. Querying `template.content` with our existing image/video/styled selectors.
3. For styled elements, extracting inline styles directly using `getAttribute('style')` rather than relying on `getComputedStyle`.
4. Passing the collected URLs to the existing `resolveUrl` plumbing.

## Warden Section
- **Security:** Since we are querying inert `template.content` using native `querySelectorAll` and reading attributes (`src`, `data-src`, `style`), there is no remote code execution risk. We are not injecting scripts or modifying the DOM.
- **Store review risk:** Safe. No new permissions (like `<all_urls>` or `webRequest`) are needed.
- **Protocol:** URLs extracted from `template.content` must still be passed through the existing `resolveUrl` allowlist.

## Feather Section
- **Performance:** Querying `template.content` is generally fast, but querying across all templates on a heavy page could add overhead. In benchmarking (1,000 templates with images and styled spans), a brute-force sweep took ~230ms on jsdom.
- **Hot-path Impact:** Due to the traversal cost, this should **not** be polled or placed on a fast path (like the `MutationObserver`). It should be restricted to the initial static scan (`initialScan`) or strictly on-demand (e.g., triggered on popup connect, similar to `collectInlineSvgs`).

## False-Positive Story
Because `<template>` tags can contain placeholder or default configurations, we might surface URLs like `placeholder.png` or `default_avatar.svg`. The existing size filter (`MIN_IMAGE_SIZE`) will mitigate small icons, but the network probe will ultimately validate if the placeholder resolves to a real image. To minimize noise, we can apply the same logic we use for `<img>` tags: prioritizing data attributes over `src` when lazy-loading patterns are detected.

## Verdict
**GO, staged.**

## Implementation Sketch (Scout/Feather)
**Stage 1:** Add a new function `collectTemplateMedia()` that runs once during the `initialScan` (or on popup connect) to extract URLs from `document.querySelectorAll('template')`.
```javascript
function collectTemplateMedia(imageUrls, videoUrls) {
  const templates = document.querySelectorAll('template');
  for (let i = 0; i < templates.length; i++) {
    const content = templates[i].content;
    const mediaNodes = content.querySelectorAll('img, video, source, [style*="background"], [style*="mask"]');
    for (let j = 0; j < mediaNodes.length; j++) {
      const el = mediaNodes[j];
      if (isImgLike(el)) {
        // extract using MEDIA_SRC_ATTRS
      } else if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') {
        // extract poster/src
      } else if (el.hasAttribute('style')) {
        // use extractBgImageUrls directly on el.getAttribute('style')
      }
    }
  }
}
```
