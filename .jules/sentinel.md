## 2026-07-30 - URL Parser Differential Vulnerability
**Vulnerability:** A parser differential vulnerability where the `download_image` and `download_images_bulk` actions in `src/background.js` were validating the URL using the `URL` constructor but passing the raw string to the `browser.downloads.download()` API.
**Learning:** The URL validation logic could parse a URL differently than the execution logic, allowing a malicious payload to bypass validation checks.
**Prevention:** Always use the normalized output (`urlObj.href`) of the `URL` constructor when executing logic that depends on the validated URL.
