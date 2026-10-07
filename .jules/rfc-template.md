# ⛏️ Prospector RFC: `<template>` tag disconnected DOM traversal

**Gap & Real-World Evidence:**
The existing `imgsnag` content script relies heavily on DOM traversal via `document.querySelectorAll`, `document.images`, `MutationObserver` and `TreeWalker`. However, standard DOM traversal methods do not penetrate the inert contents of `<template>` elements. The contents are held in a disconnected `DocumentFragment` (`template.content`). Modern frameworks and web components (e.g., custom element definitions, UI libraries, or client-side rendering fallbacks) frequently embed full component markups inside `<template>` tags, containing rich media assets (`<img>`, `<source>`, elements with inline `style="background-image: ..."`). These URLs are structurally missed by the current pipeline unless they happen to be text nodes carrying full URLs picked up by the TreeWalker regex (and even then, only if they have extensions).

Examples where this yields media missed by the current pipeline:
- Web Components / Shadow DOM definitions: `class MyEl extends HTMLElement { constructor() { super(); this.attachShadow({mode:'open'}).appendChild(document.getElementById('my-tpl').content.cloneNode(true)); } }`.
- Client-side template rendering libraries (like Mustache/Handlebars when embedded in script-type or template tags) or Alpine.js / Vue instances that use `<template>` for conditional rendering. Until the template is activated, its media is invisible to `document.images`.

**The Mechanism:**
Instead of skipping `<template>` elements, the pipeline must explicitly query `template.content.querySelectorAll(...)` to descend into the disconnected `DocumentFragment`. Since `getComputedStyle` does not work on disconnected nodes, CSS discovery within templates must fall back strictly to parsing inline `style` attributes.

**Warden Section (Security & Review Risk):**
- **Inertness:** `DocumentFragment`s inside `<template>` are inert: scripts don't run, and image `src` requests don't fire. This is safe, provided we just read the URLs without attaching the fragment to the live DOM.
- **Base Resolution:** Elements inside a template fragment resolve their relative URLs against the document's base URL, exactly like attached elements. Passing `el.src` (which gets evaluated by the browser) is safe, but we must route all extracted raw paths through the existing `resolveUrl()` method to handle sanitization and `data:`/`blob:` protocol filtering safely.
- **Review Risk:** Very low. Querying a document fragment uses standard DOM APIs and introduces no new manifest permissions.

**Feather Section (Performance & Hot-Path Impact):**
- **Initial Scan:** Querying `document.querySelectorAll('template')` is fast. Iterating over them and running a nested `content.querySelectorAll` has a low baseline cost, bounded by the number of templates on the page.
- **MutationObserver:** If a new `<template>` is added to the DOM, extracting from its `.content` is cheap. However, we must ensure we don't accidentally double-process nodes if the template's content is later cloned and attached to the main DOM (which the `MutationObserver` will catch normally). The `discoveredMedia` Map already deduplicates based on the URL, which handles the overlap safely.
- **`getComputedStyle` limitation:** Disconnected nodes have no computed style. We avoid throwing exceptions by explicitly checking if an element is inside a template or simply relying on the existing fast-path that checks `el.getAttribute('style')` before queuing it for idle processing. The idle processor must gracefully ignore disconnected nodes (which return empty string for `getComputedStyle`).

**False-Positive Story:**
Because templates often represent different state variants (e.g., a logged-out hero image vs. a logged-in avatar), extracting from `<template>` may yield images the user doesn't strictly *see* on the screen right now. However, `imgsnag`'s philosophy is extraction and discovery. The primary false-positive risk is extracting tiny icons (which the ≥200x200 filter handles, though size filtering for disconnected nodes might fail `document.images` dimension checks and fall back to the network probe).

**Recommendation:** GO.

**Implementation Sketch:**
Owner: Scout (< 50 lines).
- Stage 1: In `src/content.js`, update the initial scan. Add `document.querySelectorAll('template').forEach(tpl => { tpl.content.querySelectorAll(IMG_LIKE_SELECTOR).forEach(img => { ... }) })` and similarly for other selectors.
- Stage 2: In `MutationObserver`, when an added node is a `<template>`, extract from its `node.content`.
- Stage 3: Ensure `handleBackgroundImage` safely handles elements where `getComputedStyle` fails due to being disconnected (if they happen to end up in the queue).