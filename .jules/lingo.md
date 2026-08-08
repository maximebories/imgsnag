## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2024-08-08 - Dynamic Page Titles for Options Pages
**Learning:** Browser extension pages like `options.html` lack a default title, causing screen readers to announce the raw extension URL instead, creating a poor accessible experience.
**Action:** Always add a localized title key (e.g., `optionsTitle`) to `messages.json` and dynamically inject it using `document.title = browser.i18n.getMessage('optionsTitle');` during page initialization.
