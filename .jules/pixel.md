## 2024-07-30 - Localized Document Attributes for Screen Readers
**Learning:** Browser extension popups and options pages using `browser.i18n` often omit the `<html lang="">` attribute and `<title>` tag, causing screen readers to use default system pronunciation and announce raw extension URLs.
**Action:** Always inject `document.documentElement.lang = browser.i18n.getUILanguage();` and `document.title = browser.i18n.getMessage(...)` during script initialization.
