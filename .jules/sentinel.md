## 2024-08-03 - Parser Differential Vulnerability in URL Validation
**Vulnerability:** Raw URL strings were passed to sensitive APIs (`browser.downloads.download()`) after being validated using `new URL()`.
**Learning:** This exposes the application to parser differential vulnerabilities, where the browser engine may interpret the raw string differently than the JavaScript URL parser (e.g., allowing restricted schemes like `file://`).
**Prevention:** Always pass the normalized `urlObj.href` to sensitive APIs rather than the raw string.
