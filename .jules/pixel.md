## 2024-07-16 - Accessible Grid Cells
**Learning:** Browser extension popups containing media grids must be keyboard accessible. Adding `tabindex="0"`, explicit `role="button"` (for cells) and `role="checkbox"` (for selection toggles), along with `aria-label`s built from localized strings, makes custom `div`-based UI elements discoverable. Binding `keydown` events for `Enter` and `Space` ensures operability without a mouse.
**Action:** Always apply focus states (`:focus-visible`), ARIA roles, and keyboard listeners to custom interactive elements in popups, and route new screen-reader labels through the existing i18n system.
## 2026-07-25 - Dark Mode via CSS Color-Scheme
**Learning:** In browser extensions, native UI elements like scrollbars do not automatically inherit a dark theme simply by changing the background color in a media query. You must explicitly set `color-scheme: light dark;` on the `:root` element for full system integration.
**Action:** Always include `:root { color-scheme: light dark; }` when implementing `prefers-color-scheme: dark` in popups to ensure consistent OS-level styling.
## 2024-08-15 - prefers-reduced-motion in popups
**Learning:** Users with reduced motion preferences need instantaneous UI feedback without flashing large background areas (e.g., download confirmations). Transitioning a background flash to a localized checkmark animation (or static icon) provides accessibility while preserving the interaction model.
**Action:** Always wrap animations and transitions in `@media (prefers-reduced-motion: reduce)` to disable them globally or alter their behavior.

## 2026-08-15 - Full Context in Titles and Labels
**Learning:** Cell tooltips and ARIA labels lacking full context (like full filename and image dimensions) reduce clarity for screen-reader users and mouse users alike, especially when visual placeholders truncate long filenames.
**Action:** Always append metadata like `(width×height)` and provide untruncated filenames in `title` attributes while preserving compact UI labels.
## 2026-08-18 - aspect-ratio grid cells collapse in height-constrained scroll containers
**Learning:** Grid cells sized by `aspect-ratio` (with `overflow: hidden`, so their automatic minimum size is zero) collapse to slivers in Chrome when the grid container is height-constrained (`max-height` + `overflow-y: auto`) and content exceeds the cap — the transferred row heights are treated as compressible and every row squeezes to fit. Only visible on media-heavy pages, so it escapes light testing.
**Action:** In popup grids, size implicit rows explicitly (`grid-auto-rows: <px>`) instead of relying on cell `aspect-ratio`. Reproduce popup layout bugs with a static HTML harness + headless Chrome screenshots at 400px width before and after.

## 2026-08-18 - Semantic Buttons in Media Grids
**Learning:** Native `<button>` elements naturally support `Enter` and `Space` activation without manual `keydown` listeners. When an interactive cell contains a primary action and a secondary action (like a checkbox toggle), they should be implemented as sibling `<button>` elements positioned with `z-index`, rather than nested interactive elements (which is an accessibility anti-pattern).
**Action:** Replace `div`s styled with `role="button"` or `role="checkbox"` with native `<button>` tags when possible, and ensure interactive elements are never nested within each other. Use `inset: 0` and `z-index` to create full-coverage interaction layers.

## 2026-08-19 - Distinguishing generated files from fetched files via badge
**Learning:** For distinguishing derived files (e.g. dynamically generated inline SVGs serialized by content script) from typical network-fetched media items, a minimal visual badge using native `span` with `role="img"` and `aria-label` routed to the localization system provides clear and accessible feedback without disrupting grid UX or selection overlays. The badge should maintain the existing minimal visual language, keeping out of the way of other functional overlays (selection check, play button). 
**Action:** When adding badges to visual cells, position them carefully (e.g., top-left to avoid colliding with top-right checks), style them consistently (e.g. using the `#2563eb` accent and white text), apply `box-shadow` for contrast against unknown backgrounds, and route their accessible name to a new key across all locales in `messages.json`.
## 2024-10-24 - Empty State Hints
**Learning:** An empty state in a utility extension should not just be a dead end; it should teach the user alternative ways to achieve their goal (e.g. keyboard shortcuts or interactions) when primary discovery fails.
**Action:** Include a secondary `<span class="hint">` in empty states that provides localized tips on alternative features.
## 2026-08-22 - Positional Context for Screen Readers
**Learning:** Providing positional context ("image N of M") manually in `aria-label`s requires expensive DOM rewrites as lists grow dynamically (like infinite scroll grids). Using semantic list elements (`<ul>` and `<li>`) with explicit `role="list"` and `role="listitem"` enables screen readers to calculate and announce positional context natively and automatically without touching the DOM on every append.
**Action:** Replace `div`-based container and cell wrappers with `<ul role="list">` and `<li role="listitem">` in dynamic popups grids to gain positional context for free. Reset default list styles via CSS.

## 2024-05-24 - Explicit Counts on Bulk Action Buttons
**Learning:** For bulk action buttons (like 'Download All') in dynamic grids, appending the explicit total expected item count to the button text provides users certainty about the scope of the operation, ensuring the count updates dynamically as state changes.
**Action:** Always append the explicit total expected item count to the button text for bulk actions.

## 2024-07-25 - Hidden Item Affordance
**Learning:** When silent background processes (like visual deduplication) mutate list visibility, always provide explicit, localized UI feedback (e.g., a 'hidden items' count banner) to maintain clear system status.
**Action:** Always add localized visual feedback elements for dynamically hidden items.

## 2026-08-27 - Global Keyboard Shortcuts for Actions
**Learning:** Bottom-anchored action bars in dynamic grids become unreachable for keyboard users, requiring O(N) tabs to bypass hundreds of items. Global keyboard shortcuts with localized tooltip hints are necessary to maintain operability without a mouse.
**Action:** Implement global `keydown` listeners (e.g. `Ctrl+Enter`) for primary actions and provide localized hints in button tooltips using `$MODIFIER$` placeholder to adapt to macOS and Windows.

## 2026-08-27 - A shortcut hint belongs only on the button the shortcut fires
**Learning:** Orchestrator review of the Ctrl+Enter work: the hint was written to BOTH action buttons, but one keystroke can only activate one of them (selected-if-any, else all). With a selection active, the "Download all" tooltip advertised a shortcut that would in fact download just the selection — a bulk action mislabelled by a factor of hundreds.
**Action:** Bind the hint to the button the handler actually dispatches to, and clear the other one's `title` in the same update pass. Never advertise a shortcut on a control it does not activate.
## 2024-11-06 - Auto-save single-option settings pages
**Learning:** For a single-option settings page (like a single checkbox for dragging), having a separate "Save" button adds unnecessary friction. Auto-saving on `change` provides immediate feedback. In addition, checkboxes hidden inside labels require explicit pointer cursors to signal interactability.
**Action:** Remove standalone save buttons on single-option preference pages in favor of auto-save on `change`, and ensure label wrappers have `cursor: pointer`.
