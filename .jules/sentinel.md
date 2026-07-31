## 2024-07-31 - [URL Parser Differential Vulnerability]
**Vulnerability:** Raw URL strings were passed directly to `browser.downloads.download()` after being validated with `new URL()`.
**Learning:** A maliciously crafted URL might pass the `new URL()` validation but be interpreted differently by the `browser.downloads.download()` API due to parser differences.
**Prevention:** Always pass the normalized `urlObj.href` to sensitive APIs rather than the raw string to prevent parser differential vulnerabilities.
