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
