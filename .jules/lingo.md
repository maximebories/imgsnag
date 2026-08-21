## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2026-07-21 - Dynamic lang and title for extension HTML pages
**Learning:** Static HTML pages without user-facing copy lack `lang` attributes and titles, causing screen readers to use incorrect pronunciation or read raw URLs.
**Action:** Dynamically inject `document.documentElement.lang = browser.i18n.getUILanguage();` during initialization and set `document.title` via `browser.i18n.getMessage(...)`.
## 2026-07-25 - Localized SVG Badge Text
**Learning:** Hardcoded text like 'SVG' in visual badges bypasses the i18n pipeline and prevents consistent translation across locales.
**Action:** When adding visual indicators or badges, always extract the text into a localization key in `messages.json` and use `browser.i18n.getMessage` in JS.
