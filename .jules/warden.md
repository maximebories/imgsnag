## 2024-05-24 - Unrestricted Protocol Scheme Parsing & Synthetic Events
**Vulnerability:** The extension runs with `<all_urls>` permission on pages and implicitly trusts the `src` / `srcset` / URLs it encounters or dynamically parses, feeding them into the extension's download functions via `downloads.download()`. In `resolveUrl()`, there was no protocol allowlisting. An attacker could embed `javascript:`, `file:`, or `chrome:` URLs on a page or synthesize click / drag events to force the extension to download or execute unintended actions.
**Fix:** Added strict protocol whitelisting (`http:`, `https:`, `blob:`, `data:`) in `resolveUrl` trust boundary. Checked for `e.isTrusted` in event listeners to block synthetic events.

## 2025-02-28 - ReDoS Vulnerability in Content Script
**Vulnerability:** A ReDoS vulnerability was present in `src/content.js` due to a regular expression `/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi` being executed via `.replace()` against the entire `document.body.innerHTML`. This caused severe performance degradation (taking over 2 seconds) on pages with exceptionally large `<script>` tags, making it exploitable. Fixed by replacing the regex strip operation with a native DOM `TreeWalker` to securely extract relevant text nodes and element attributes instead.

## 2024-05-15 - URL Parser Differential in Download Handler
**Vulnerability:** URL parser differential (parser mismatch) in IPC message handlers. The background script validated the raw `message.url` string using `new URL()` but passed the raw, unnormalized string to the sensitive `browser.downloads.download()` API.
**Learning:** Using different representations of a URL (raw string vs parsed object) between validation and execution allows attackers to bypass protocol restrictions.
**Prevention:** Always pass the normalized `urlObj.href` from the validated URL object to sensitive APIs instead of the raw string.
