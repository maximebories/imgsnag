## 2025-02-28 - Parser Differential Vulnerability in URL Validation
**Vulnerability:** In `src/background.js`, when URL validation was performed using `new URL()`, the raw, unnormalized URL variables were passed to `browser.downloads.download()`. This could lead to parser differential vulnerabilities where the browser parses the URL differently than the validation check, bypassing the protocol restriction.
**Learning:** Always pass the normalized `urlObj.href` to sensitive APIs rather than the raw string.
**Prevention:** Use the parsed and normalized URL object properties instead of the raw input strings when dealing with sensitive operations.
