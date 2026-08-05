## 2025-03-01 - Prevent redundant screen reader announcements in grid cells
**Learning:** Screen readers will redundantly read raw image URLs (which can be very long) if `img` elements inside custom `role="button"` elements do not have an empty `alt=""` attribute, and non-dynamic `aria-label`s on repeated list items cause the screen reader to just announce "Download, button" over and over again without item context.
**Action:** Always set `img.alt = ''` when the parent container handles the semantic meaning (like a custom button role), and append unique contextual text (like a filename) to `aria-label`s inside iterated UI structures.
## 2025-08-05 - Dynamic Language and Title Injection
**Learning:** Browser extension pages often lack static `lang` attributes and `<title>` tags because they depend on `browser.i18n`. This leads to poor screen reader pronunciation and context.
**Action:** Always dynamically inject `document.documentElement.lang = browser.i18n.getUILanguage();` and `document.title` on extension UI initialization. Hide decorative SVGs with `aria-hidden="true"`.
