## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2026-08-05 - Missing document.title and lang attributes
**Learning:** HTML files lacked dynamic lang attributes and the options page lacked a proper title, causing screen readers to mispronounce or announce raw URLs.
**Action:** Always inject document.documentElement.lang and document.title dynamically via JS on load for extension pages.
