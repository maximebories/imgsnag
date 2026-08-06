## 2026-08-06 - Prevent URL Parser Differential Vulnerabilities
**Vulnerability:** URL validation via `new URL(url)` followed by passing the raw user-supplied string (`url`) to sensitive APIs like `browser.downloads.download()`.
**Learning:** Different URL parsers (e.g., the browser extension API vs JavaScript's `URL` object) may handle malformed URLs differently. An attacker might bypass the validation check but still exploit the underlying API by exploiting this parser differential.
**Prevention:** Always pass the normalized `urlObj.href` to downstream APIs after validating the URL object.
