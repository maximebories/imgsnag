# ⛏️ Prospector RFC: `<template>` content extraction

## The Gap
The current content script relies on live DOM queries (e.g., `document.images`, `document.querySelectorAll`, `document.createTreeWalker`, and `MutationObserver` on document additions) to find media. However, modern web frameworks and native Web Components often ship significant chunks of their UI (including media) inside HTML `<template>` elements.

A `<template>` element's contents are an inert `DocumentFragment` (`template.content`). Crucially, this fragment is **completely invisible** to standard DOM queries targeting the main document:
- `document.images` returns 0 for images inside a template.
- `document.querySelectorAll('img')` returns an empty NodeList.
- `document.createTreeWalker(document.documentElement, ...)` does not traverse into `<template>` content.
- `getComputedStyle(el)` returns nothing useful for elements inside a template because they are detached from the active CSSOM cascade.

While the framework will eventually clone this fragment and attach it to the live DOM (at which point `MutationObserver` will catch it), it is highly common for pages to pre-load templates that contain fully-formed `<img src="...">` tags or `style="background-image: url(...)"` attributes that the user might want to capture *before* interacting with the widget that mounts them. Furthermore, SSR output often contains templates for client-side hydration.

**Real-world evidence:**
1.  **Web Components / Lit / Polymer apps** (like YouTube's desktop UI) extensively use `<template>` elements for UI definition.
2.  **Vue.js / Alpine.js** applications sometimes leave `<template>` nodes in the DOM before mounting or when using `v-if` / `x-if` blocks that contain media.

## The Mechanism
To capture this media, the pipeline must explicitly discover `<template>` elements and manually traverse their `content` properties (`DocumentFragment`).

Because the content is inert:
1.  **No Network Side-Effects:** The browser does not initiate fetches for `src` attributes inside a template, making it safe to parse.
2.  **No CSSOM / Rendering:** `getComputedStyle` and `getBoundingClientRect` do not work. Background images must be extracted strictly from inline `style` attributes. Size filtering (`el.naturalWidth` or `el.width`) cannot be evaluated instantly and must rely entirely on the deferred network probe (`getImageSize` / `pendingNetworkFilter`).
3.  **No `src` property resolution:** Like nodes from `DOMParser` in `<noscript>` (RFC #298), reading `el.src` on an inert element often yields useless relative paths or empty strings depending on the browser. We must read the raw `el.getAttribute('src')` and pass it through `resolveUrl(val)` against `document.baseURI`.

The mechanism would reuse the existing stateless media extractors (`handleImg`, `handleSrcset`, `handleSource`, `handlePicture`, etc.) on the nodes yielded by a `querySelectorAll('*')` run over each template's `content` fragment.

## Warden Section (Security & Store Review)
- **Execution Context:** The `template.content` is already part of the page's DOM, parsed by the browser's HTML parser. Traversing it does not execute scripts (`<script>` inside a template is inert until cloned and attached).
- **URL Resolution:** All extracted raw attributes MUST be passed through the existing `resolveUrl()` allowlist.
- **Store Risk:** Low. This uses standard DOM APIs to read existing page state. It is functionally identical to the `<noscript>` DOMParser path but operates on nodes the browser has already parsed.

## Feather Section (Performance Budget)
- **Cost on pages WITHOUT templates:** Extremely low. The initial query `document.querySelectorAll('template')` is fast and returns an empty list.
- **Cost on pages WITH templates:** We must iterate all elements within the template fragment. Reusing the static handlers (like in `collectNoscriptImages`) avoids the overhead of regex sweeps over text nodes.
- **Hot-path Impact:** Template extraction should *not* happen during ambient discovery (initial scan) if the template count is unbounded. Like `collectNoscriptImages` or `collectInlineSvgs`, it is best deferred to **popup connect** so the cost is only paid when the user actually requests media.

## False-Positive Story
What garbage does this surface?
1.  **Sprite sheets / UI icons:** Templates often contain SVG icons or UI placeholders. The existing `MIN_IMAGE_SIZE` filter (applied lazily via network probe since inline `naturalWidth` is 0) will naturally cull tiny UI elements.
2.  **Placeholder URLs:** Templates might contain `src="{{imageUrl}}"` or `src="about:blank"`. The existing `isImageUrl()` / `resolveUrl()` logic and the popup's network probe filter will cleanly reject malformed URLs or 404s.

## Verdict
**GO**, staged.

## Implementation Sketch (for Scout)
**Stage 1: On-Demand Extraction (Popup Connect)**
In `src/content.js`, add a `collectTemplateMedia()` function analogous to `collectNoscriptImages()`.

```javascript
function collectTemplateMedia() {
  const imageUrls = new Set();
  const videoUrls = new Set();

  document.querySelectorAll('template').forEach((template) => {
    if (!template.content) return; // Guard for old browsers, though MV3 targets support it

    template.content.querySelectorAll('*').forEach((el) => {
      // Reuse existing handlers. Crucially, handlers like handleImg must check
      // el.ownerDocument === document to decide between el.src vs el.getAttribute('src').
      // Since template content lives in the same document but is a DocumentFragment,
      // el.ownerDocument is the main document, BUT el.src STILL resolves correctly in Chrome.
      // However, to be safe, we rely on the attribute fallback logic already built for <noscript>.
      handleImg(el, imageUrls);
      handleSrcset(el, imageUrls);
      handleSource(el, imageUrls, videoUrls);
      handlePicture(el, imageUrls);

      // Inline styles for background-images
      if (el.hasAttribute('style')) {
        const bg = el.style.backgroundImage;
        if (bg && bg !== 'none' && bg !== 'normal') {
          for (const raw of extractBgImageUrls(bg)) {
            const url = resolveUrl(raw);
            if (url && !url.startsWith('data:')) imageUrls.add(url);
          }
        }
      }
    });
  });

  return { imageUrls, videoUrls };
}
```
Call this function in the `browser.runtime.onConnect` listener alongside `collectNoscriptImages()`.