# ⛏️ Prospector RFC: `<template>` extraction

## The Gap

The current DOM-scanning pipeline relies on `document.querySelectorAll` and `document.createTreeWalker` to discover media elements in the live document. However, standard DOM traversal methods do not penetrate the contents of `<template>` elements.

`<template>` elements hold inert HTML fragments that are not part of the active DOM tree until they are explicitly cloned and inserted by JavaScript. As a result, media assets defined inside `<template>` blocks (e.g., placeholder images, UI components, or gallery thumbnails for client-side rendering) are completely invisible to both `collectImages` (which queries the document) and the regex `TreeWalker` sweep.

Real-world evidence:
1. Web components / Lit / Polymer often store their shadow-DOM templates in `<template>` tags before attaching them. Any media inside the component's static template is hidden until the component mounts.
2. SPAs and vanilla JS galleries frequently use `<template>` for client-side list rendering, hiding the original high-res URL in the template markup.

## The Mechanism

To extract media from `<template>` elements, we must explicitly query the `template.content` property, which returns a `DocumentFragment`.

```javascript
document.querySelectorAll('template').forEach(tpl => {
  tpl.content.querySelectorAll('*').forEach(el => {
     // Run existing handleImg, handleSrcset, etc.
  });
});
```

Because elements inside `template.content` are inert and disconnected from the browsing context:
- `getComputedStyle` does not work (returns empty values). Therefore, finding CSS background images requires parsing inline `style` attributes directly instead of relying on computed styles.
- `src` fetches do not fire, so extracting URLs from these elements does not trigger network requests.
- `MutationObserver` does not fire for mutations *inside* a template's fragment. However, when a `<template>` is added to the DOM, we can scan its `.content`.

## The Verdict: GO

**Stage 1 (Scout):** Extend `collectImages`/`collectVideos` to include a sweep over `document.querySelectorAll('template')`. For each template, run `querySelectorAll('*')` on its `.content` property and pass the elements through our standard extraction handlers (`handleImg`, `handleSrcset`, `handlePicture`, etc.). Do not attempt `getComputedStyle` resolution on these nodes. Add a similar check in the `MutationObserver` for newly added `<template>` nodes.

## Warden Section
Elements inside `template.content` are inert. Reading their `src` or `data-*` attributes does not trigger execution or fetches. We must ensure we resolve extracted URLs via our standard `resolveUrl` safe-protocol filter, as relative URLs might resolve against the page base URI. There are no new manifest permissions required.

## Feather Section
Querying `document.querySelectorAll('template')` is extremely fast. Iterating over `.content` is synchronous but strictly bounded by the size of the template. We bypass the expensive `getComputedStyle` queue for these nodes since it wouldn't work anyway, keeping the per-element cost strictly limited to regex matching and attribute reading. The cost on pages without `<template>` tags is zero.

## False Positive Story
The false-positive risk is negligible. Since we parse actual DOM elements (like `<img>` or `<video>`) inside the template rather than unstructured text, anything we extract represents a true media asset intended for display by the page's scripts. The existing `resolveUrl` logic accurately handles any relative paths inside the template based on the parent document's `baseURI`.
