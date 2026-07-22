## 2024-07-16 - Accessible Grid Cells
**Learning:** Browser extension popups containing media grids must be keyboard accessible. Adding `tabindex="0"`, explicit `role="button"` (for cells) and `role="checkbox"` (for selection toggles), along with `aria-label`s built from localized strings, makes custom `div`-based UI elements discoverable. Binding `keydown` events for `Enter` and `Space` ensures operability without a mouse.
**Action:** Always apply focus states (`:focus-visible`), ARIA roles, and keyboard listeners to custom interactive elements in popups, and route new screen-reader labels through the existing i18n system.

## 2024-07-28 - System Dark Theme Parity in Popups
**Learning:** When implementing `prefers-color-scheme: dark` in browser extension popups, including `:root { color-scheme: light dark; }` is critical to ensure native UI elements like scrollbars and inputs automatically adapt to the system's dark theme without visual conflicts.
**Action:** Always include `:root { color-scheme: light dark; }` when adding dark mode media queries to extension popups.
