## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2026-07-21 - Dynamic lang and title for extension HTML pages
**Learning:** Static HTML pages without user-facing copy lack `lang` attributes and titles, causing screen readers to use incorrect pronunciation or read raw URLs.
**Action:** Dynamically inject `document.documentElement.lang = browser.i18n.getUILanguage();` during initialization and set `document.title` via `browser.i18n.getMessage(...)`.
## 2026-08-25 - Filenames are not UI copy
**Learning:** Three separate runs proposed localizing the inline-SVG filename. The distinction that settles it: strings shown in the popup (cell aria-label/title) are UI copy and SHOULD be localized; the value passed to downloads.download({filename}) is written to the user disk and must stay locale-stable (users sort and script against it).
**Action:** Localize display labels, never download filenames. Recorded in jules/lingo.md as settled doctrine.
