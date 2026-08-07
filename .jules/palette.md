## 2025-03-01 - Prevent redundant screen reader announcements in grid cells
**Learning:** Screen readers will redundantly read raw image URLs (which can be very long) if `img` elements inside custom `role="button"` elements do not have an empty `alt=""` attribute, and non-dynamic `aria-label`s on repeated list items cause the screen reader to just announce "Download, button" over and over again without item context.
**Action:** Always set `img.alt = ''` when the parent container handles the semantic meaning (like a custom button role), and append unique contextual text (like a filename) to `aria-label`s inside iterated UI structures.

## 2026-08-07 - Hide decorative icons in semantically labeled containers
**Learning:** Screen readers may announce confusing or redundant information if purely decorative inline SVGs inside `role="button"` containers are not explicitly hidden.
**Action:** Always add `aria-hidden="true"` to decorative SVGs when the parent container handles the semantic meaning.
