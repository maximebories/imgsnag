# ⛏️ Prospector RFC: `<template>` content extraction

## Target
Extract media URLs from inert DOM nodes contained within `<template>` tags.

## The Gap
The current media extraction pipeline misses content inside `<template>` elements.

There are two primary ways the pipeline searches for DOM media:
1. `document.querySelectorAll()` / `document.images`
2. `TreeWalker` Regex sweep over text nodes and attributes.

Neither mechanism reaches inside a `<template>` element's `content` property (which is a `DocumentFragment`). A `<template>` is considered inert, so the main document tree traversal naturally stops at the `<template>` boundary, entirely bypassing the underlying `<img src>`, `<source srcset>`, and inline styles present in its template payload.

Because these nodes are inert and disconnected from the live DOM, styles are not evaluated, which breaks the `getComputedStyle` path for extracting background images. However, inline `style` attributes are still present on the DOM elements within the template fragment.

Modern web frameworks (like Web Components, Lit, Vue, and vanilla template strategies) heavily utilize `<template>` tags to define reusable chunks of UI that often contain images, which are cloned and stamped into the DOM later.

## Real-world Evidence
Many Web Components (Custom Elements) use shadow DOM combined with `<template>` tags to define their internal structure.
For example, custom product carousels or image galleries that hold unseen slides inside a template until they need to be shown to the user.
- **Example 1:** Standard Web Components using templates for slots and shadow DOM payloads (e.g., standard MDN examples for `slot` and `template`, Lit components using internal templates before stamping).
- **Example 2:** Client-side rendered lists where row skeletons/templates are defined in `<template id="row-template">`, often containing default avatar or placeholder images that the user might want to capture.

## Mechanism
To capture these, the pipeline needs an explicit sweep over `<template>` elements in the document:
1. Query all `<template>` tags via `document.querySelectorAll('template')`.
2. Iterate over them and reach into their `content` property (a `DocumentFragment`).
3. Recursively walk this fragment. Since we cannot use `getComputedStyle` on disconnected nodes, we must:
   - Extract standard DOM attributes (`src`, `srcset`, etc.) off known elements (`IMG`, `PICTURE`, etc.) inside the fragment.
   - Sweep inline `style` attributes manually for `url(...)` declarations to catch background images.
   - Alternatively, pass the fragment's roots into the existing `TreeWalker` regex sweep logic, as `TreeWalker` can be explicitly rooted at `template.content`.

## Warden Section (Security & Review Risk)
**Attack surface:** Minimal. `template.content` is still standard DOM; we are reading attributes from elements that the current page context created. It does not introduce new fetching behavior unless we explicitly pass the parsed URLs into an insecure context, which is guarded by `resolveUrl` already.
**Origin implications:** None; reading same-origin DOM.
**Store-review risk:** None; using standard DOM APIs (`HTMLTemplateElement.content`).

## Feather Section (Performance & Cost)
**Per-page cost:** Searching for `<template>` tags via `querySelectorAll` on the initial scan is very cheap (templates are generally sparse compared to divs or spans).
**Hot-path impact:**
- If added to the `MutationObserver`, scanning newly inserted `<template>` tags explicitly will add a small overhead.
- However, since `getComputedStyle` *cannot* be run on inert nodes, we bypass the most expensive part of the standard pipeline. Inline style regexes (`[style*="background"]`) are fast.
- Passing `template.content` into a `TreeWalker` regex sweep is O(N) over the template's text/attributes, which is proportional to the template size.

## False-Positive Story
The extraction mechanism is identical to the main page extraction, subject to the same `MIN_IMAGE_SIZE` and `resolveUrl` filtering. The main difference is that templates might hold *placeholder* assets rather than the final dynamic media, which could result in capturing generic placeholder images. However, these are legitimate URLs defined in the markup. Since they are inert, their sizes might not be measurable with `getBoundingClientRect()` (they are 0x0), so they may require the same deferred `new Image()` size-probe queue as other non-rendered assets if they do not specify width/height attributes.

## Verdict
**GO, staged.**
This fills a clear structural gap where the existing extraction pipeline simply does not traverse.

## Implementation Sketch

**Stage 1 (Scout) - Initial static scan support:**
Add a new function `collectTemplateContent` called alongside `collectImages`/`collectVideos` during the initial scan.
```javascript
function collectTemplateContent(trackImage) {
  document.querySelectorAll('template').forEach(tpl => {
    // 1. Standard images and media elements
    tpl.content.querySelectorAll(IMG_LIKE_SELECTOR).forEach(el => {
      // (Similar to collectImages logic)
      SOURCE_URL_ATTRS.forEach(attr => {
        const raw = el.getAttribute(attr);
        if (raw) trackImage(raw);
      });
    });

    // 2. Inline background images (getComputedStyle won't work)
    tpl.content.querySelectorAll('[style*="background"], [style*="mask"]').forEach(el => {
      const style = el.getAttribute('style');
      if (!style) return;
      const matches = [...style.matchAll(BG_URL_RE)];
      for (const match of matches) {
        if (match[1]) trackImage(match[1]);
      }
    });

    // 3. TreeWalker over the fragment for the regex sweep
    const walker = document.createTreeWalker(tpl.content, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, REGEX_SWEEP_FILTER);
    // ... run standard sweep logic over this walker
  });
}
```

**Stage 2 (Scout) - MutationObserver integration:**
Update the `MutationObserver` logic in `src/content.js`. If an added node is a `<template>`, explicitly process its `.content` property using the logic developed in Stage 1.