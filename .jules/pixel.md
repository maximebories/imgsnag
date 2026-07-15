## 2024-07-15 - [Popup Accessibility Improvements]

- Added keyboard navigability to grid cells and checks in `popup.js` using `tabindex`, `role`, and `keydown` event listeners for 'Enter' and 'Space'.
- Ensured nested interactive elements (e.g. check inside cell) do not conflict by utilizing `e.stopPropagation()` when the inner element is activated.
- Provided appropriate `aria-label` attributes to elements using i18n messages to make the UI accessible to screen readers, while dynamically updating the `aria-checked` state for the check overlay.
- Added visual focus indicators using `:focus-visible` in `popup.html` matching the primary `#2563eb` accent.
- Adhered to the `_locales` requirement by updating `en`, `es`, and `fr` `messages.json` with new string keys.
