## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2024-08-06 - Dynamic Title and Lang for HTML pages
**Learning:** HTML pages in extensions lack user-facing copy, which means they often miss `title` and `lang` attributes, leading to a poor screen reader experience where the raw URL is announced.
**Action:** Dynamically inject `document.documentElement.lang = browser.i18n.getUILanguage()` and `document.title = browser.i18n.getMessage(...)` on initialization for all HTML pages.
