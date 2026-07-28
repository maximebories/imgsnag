## 2025-03-01 - Prevent redundant screen reader announcements in grid cells
**Learning:** Screen readers will redundantly read raw image URLs (which can be very long) if `img` elements inside custom `role="button"` elements do not have an empty `alt=""` attribute, and non-dynamic `aria-label`s on repeated list items cause the screen reader to just announce "Download, button" over and over again without item context.
**Action:** Always set `img.alt = ''` when the parent container handles the semantic meaning (like a custom button role), and append unique contextual text (like a filename) to `aria-label`s inside iterated UI structures.

## 2025-03-01 - Add dynamic lang attributes to HTML tags
**Learning:** Screen readers may use the wrong pronunciation if the `<html lang="X">` attribute does not match the actual UI language, which varies dynamically based on `browser.i18n.getUILanguage()`.
**Action:** Always set `document.documentElement.lang = browser.i18n.getUILanguage();` during script initialization for browser extension HTML pages to ensure accurate localization and pronunciation.
