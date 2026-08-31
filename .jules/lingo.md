## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2026-07-21 - Dynamic lang and title for extension HTML pages
**Learning:** Static HTML pages without user-facing copy lack `lang` attributes and titles, causing screen readers to use incorrect pronunciation or read raw URLs.
**Action:** Dynamically inject `document.documentElement.lang = browser.i18n.getUILanguage();` during initialization and set `document.title` via `browser.i18n.getMessage(...)`.
## 2026-08-25 - Filenames are not UI copy
**Learning:** Three separate runs proposed localizing the inline-SVG filename. The distinction that settles it: strings shown in the popup (cell aria-label/title) are UI copy and SHOULD be localized; the value passed to downloads.download({filename}) is written to the user disk and must stay locale-stable (users sort and script against it).
**Action:** Localize display labels, never download filenames. Recorded in jules/lingo.md as settled doctrine.
## 2026-08-25 - A localized label that shows a filename must show the REAL filename
**Learning:** Routing the inline-SVG cell label through i18n produced es/fr values (en-linea.svg, en-ligne.svg) that no longer matched the file background.js actually writes (imgsnag-inline.svg) — the tooltip promised one name and the disk got another.
**Action:** Localize the words AROUND a filename; give every locale the real filename itself. Recorded in jules/lingo.md.
## 2026-08-27 - Action bar layout slack is under 9px at 400px
**Learning:** The `es`/`fr` action-bar strings were verified to fit at 400px on 2026-08-27; the bar has under 9px of slack, so future string growth in that row needs re-measuring. See issue #163 for details.
**Action:** Do not arbitrarily shorten idiomatic UI text without rendering and measuring first.
## 2026-08-28 - Descriptions for ambiguous translations
**Learning:** Keys whose message is a single ambiguous noun or contain placeholders whose meaning isn't self-evident often lead to mistranslations because translators have no UI context.
**Action:** When adding new keys that are short ambiguous words or contain `$1`/`$2` placeholders, always include a `description` field for context.
## 2026-08-31 - Hardcoded textContent for error placeholder removed
**Learning:** Error placeholders for images sometimes display hardcoded empty strings or missing paths. They should use the same fallback logic as their `aria-label` equivalents using `popupMediaFallback`.
**Action:** Always wrap dynamically generated placeholders with a locale-aware fallback (`popupMediaFallback`) instead of relying solely on raw `filenameFromUrl`.
