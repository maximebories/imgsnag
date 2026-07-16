## 2026-07-16 - Adding i18n keys for accessibility attributes
**Learning:** When dynamically adding accessibility labels (like title, aria-label) in Javascript, translations must be kept in sync across all supported locales (en, es, fr) to ensure completeness. Empty strings in messages.json must be avoided.
**Action:** Always verify that newly added message keys are present in all locale message.json files and avoid checking in any built dist files.
