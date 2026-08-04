## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2024-05-24 - Dynamic language and title for accessibility
**Learning:** Screen readers need correct language tags and titles to announce extension pages properly. If missing, they read the raw URL and may mispronounce text in different locales.
**Action:** Always dynamically inject `document.documentElement.lang = browser.i18n.getUILanguage();` and `document.title = browser.i18n.getMessage('...')` on page load.
