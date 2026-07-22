## 2025-03-01 - Prevent redundant screen reader announcements in grid cells
**Learning:** Screen readers will redundantly read raw image URLs (which can be very long) if `img` elements inside custom `role="button"` elements do not have an empty `alt=""` attribute, and non-dynamic `aria-label`s on repeated list items cause the screen reader to just announce "Download, button" over and over again without item context.
**Action:** Always set `img.alt = ''` when the parent container handles the semantic meaning (like a custom button role), and append unique contextual text (like a filename) to `aria-label`s inside iterated UI structures.

## 2023-10-25 - Contrast and ARIA feedback in Media Grids
**Learning:** Gray text on light gray backgrounds (#888 on #f5f5f5 and #999 on #e0e0e0) often fails WCAG AA contrast requirements. Additionally, dynamic counters representing selected items need `aria-live` to inform screen reader users of the global state change when a local checkbox is toggled.
**Action:** Always verify contrast ratios for empty states and placeholder text. Use `aria-live="polite"` for selection counters.
