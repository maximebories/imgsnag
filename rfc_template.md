# ⛏️ Prospector RFC: `<template>` content extraction

## The Gap

The current DOM extraction pipeline (both the initial `collectImages`/`collectVideos` static scan and the fallback `TreeWalker` regex sweep) cannot see media inside `<template>` elements.

Standard DOM traversal methods (`querySelectorAll`, `TreeWalker`, `document.images`) do not penetrate inert `<template>` contents because they exist in a disconnected `DocumentFragment` (`template.content`). A `TreeWalker` rooted at `document.documentElement` completely skips them. We miss any media assets (images, background styles, videos) defined within templates.

**Real-world evidence:**
1. **Web Components & Client-Side Templates:** Modern sites using native Web Components often define their internal shadow DOM structure using a `<template>` tag. If this template contains high-quality default or fallback images, `imgsnag` currently ignores them.
2. **Lazy-rendered galleries & UI Frameworks:** Many UI libraries and custom carousels embed upcoming slides or modal content inside `<template>` tags to avoid rendering cost, instantiating them only on interaction. The media inside these inert templates is structurally defined but invisible to our existing regex and DOM sweeps.

## The Mechanism

To extract media from templates, we must explicitly query the `template.content` property (which is a `DocumentFragment`).

Since `<template>` contents are inert, they behave similarly to the recently implemented `<noscript>` fallback extraction:
1. `template.content.querySelectorAll('*')` can be traversed using the existing element handlers (`handleImg`, `handleSrcset`, `handleSource`, `handlePicture`).
2. Like `<noscript>`, `getComputedStyle` does not apply to disconnected elements. Therefore, we must explicitly parse inline `style` attributes to discover CSS background images using a modified fast-path that ignores `className` or `id`.

## Warden Section (Security & Store Review Risk)

**Attack Surface & Execution Risk:**
 Traversing `template.content` is strictly read-only and uses the existing `DocumentFragment`. Because it's inert by definition (scripts inside `<template>` do not execute, network fetches for `<img src>` do not fire until cloned/attached), extracting attributes from it is as safe as reading static HTML.

**Origin Implications:**
 There are no cross-origin implications. We are reading the page's existing DOM, requiring no new permissions or network requests. The existing `resolveUrl()` sandboxing applies to ensure safe URLs.

## Feather Section (Performance Budget)

**Hot-path Impact:**
 Adding `<template>` scanning to the ambient `MutationObserver` or the initial page scan has a cost proportional to the number of `<template>` elements on the page.

However, since `template.content` is inert, it has no layout and no CSSOM. We completely avoid the `getComputedStyle` cost. The extraction relies entirely on attribute parsing, which is extremely fast. The size of the search space is bounded by the DOM itself.

*Initial Scan:* `document.querySelectorAll('template')` followed by our standard attribute handlers on the fragment is very cheap.
*MutationObserver:* We already iterate over `addedNodes`. If a `<template>` is added, we traverse its `.content`.

**False-positive Story:**
 Templates might contain placeholder variables (e.g., `<img src="{{imageUrl}}">`). The existing `resolveUrl()` and regex validation guard against parsing template literals as valid URLs. If a URL resolves correctly and passes the network size filter, it's a valid media asset.

## Verdict: GO (Staged)

The cost is minimal, the mechanism is safe, and it structurally uncovers media that is currently invisible to the extension.

### Implementation Sketch (Scout - < 50 lines)

**Stage 1:**
Introduce a `collectTemplateMedia()` function analogous to `collectNoscriptImages()` that runs during the initial scan (or popup connect).

```javascript
function collectTemplateMedia() {
  const imageUrls = new Set();
  const videoUrls = new Set();

  document.querySelectorAll('template').forEach((template) => {
    template.content.querySelectorAll('*').forEach((el) => {
      handleImg(el, imageUrls);
      handleSrcset(el, imageUrls);
      handleSource(el, imageUrls, videoUrls);
      handlePicture(el, imageUrls);

      // Inline style parsing for background images since getComputedStyle fails here
      if (el.hasAttribute('style')) {
         const styleStr = el.getAttribute('style');
         if (styleStr.includes('background') || styleStr.includes('mask') || styleStr.includes('content')) {
             // Re-use logic from getCssMediaUrls fast path
             for (const raw of extractBgImageUrls(styleStr)) {
               const url = resolveUrl(raw);
               if (url && isImageUrl(url) && !url.startsWith('data:')) imageUrls.add(url);
             }
         }
      }
    });
  });

  return { imageUrls, videoUrls };
}
```