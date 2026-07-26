## 2024-07-16 - Accessible Grid Cells
**Learning:** Browser extension popups containing media grids must be keyboard accessible. Adding `tabindex="0"`, explicit `role="button"` (for cells) and `role="checkbox"` (for selection toggles), along with `aria-label`s built from localized strings, makes custom `div`-based UI elements discoverable. Binding `keydown` events for `Enter` and `Space` ensures operability without a mouse.
**Action:** Always apply focus states (`:focus-visible`), ARIA roles, and keyboard listeners to custom interactive elements in popups, and route new screen-reader labels through the existing i18n system.
## 2026-07-25 - Dark Mode via CSS Color-Scheme
**Learning:** In browser extensions, native UI elements like scrollbars do not automatically inherit a dark theme simply by changing the background color in a media query. You must explicitly set `color-scheme: light dark;` on the `:root` element for full system integration.
**Action:** Always include `:root { color-scheme: light dark; }` when implementing `prefers-color-scheme: dark` in popups to ensure consistent OS-level styling.
## 2024-05-18 - Dynamic Lang Attributes for Extension Pages
**Learning:** HTML files in browser extensions relying on `browser.i18n` for localization cannot use static `lang` attributes (e.g., `lang="en"`) on the `<html>` element, which harms accessibility by confusing screen readers if the user's UI language differs.
**Action:** Always inject the correct language dynamically via JavaScript using `document.documentElement.lang = browser.i18n.getUILanguage();` during page initialization for i18n-supported extension popups and options pages.
