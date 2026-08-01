## 2025-03-01 - Prevent redundant screen reader announcements in grid cells
**Learning:** Screen readers will redundantly read raw image URLs (which can be very long) if `img` elements inside custom `role="button"` elements do not have an empty `alt=""` attribute, and non-dynamic `aria-label`s on repeated list items cause the screen reader to just announce "Download, button" over and over again without item context.
**Action:** Always set `img.alt = ''` when the parent container handles the semantic meaning (like a custom button role), and append unique contextual text (like a filename) to `aria-label`s inside iterated UI structures.

## 2024-05-24 - Screen Reader Hygiene for Extension Popups
**Learning:** Extension pages often lack semantic structure by default (no static `lang` attribute, missing `<title>`). Elements used purely for visual feedback or nested icons (like `.spinner`, `.flash`, or SVGs) can cause redundant screen reader announcements if not explicitly hidden.
**Action:** Always dynamically set `document.documentElement.lang` and `document.title` via `browser.i18n` on initialization. Aggressively apply `aria-hidden="true"` to non-semantic visual feedback and nested decorative elements within interactive containers.
