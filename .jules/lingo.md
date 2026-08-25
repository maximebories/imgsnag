## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2026-07-21 - Dynamic lang and title for extension HTML pages
**Learning:** Static HTML pages without user-facing copy lack `lang` attributes and titles, causing screen readers to use incorrect pronunciation or read raw URLs.
**Action:** Dynamically inject `document.documentElement.lang = browser.i18n.getUILanguage();` during initialization and set `document.title` via `browser.i18n.getMessage(...)`.
## 2026-07-23 - Hardcoded fallback filename replaced with i18n
**Learning:** Hardcoded filenames used for UI display (like `inline.svg` in titles and aria-labels) must be localized, whereas actual download filenames written to disk (like `imgsnag-inline.svg` in `background.js`) should remain stable across locales and not be localized.
**Action:** When adding fallback filenames for UI display, route them through `browser.i18n.getMessage` just like visible strings.
