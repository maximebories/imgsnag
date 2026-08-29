## 2024-05-24 - Unrestricted Protocol Scheme Parsing & Synthetic Events
**Vulnerability:** The extension runs with `<all_urls>` permission on pages and implicitly trusts the `src` / `srcset` / URLs it encounters or dynamically parses, feeding them into the extension's download functions via `downloads.download()`. In `resolveUrl()`, there was no protocol allowlisting. An attacker could embed `javascript:`, `file:`, or `chrome:` URLs on a page or synthesize click / drag events to force the extension to download or execute unintended actions.
**Fix:** Added strict protocol whitelisting (`http:`, `https:`, `blob:`, `data:`) in `resolveUrl` trust boundary. Checked for `e.isTrusted` in event listeners to block synthetic events.

## 2025-02-28 - ReDoS Vulnerability in Content Script
**Vulnerability:** A ReDoS vulnerability was present in `src/content.js` due to a regular expression `/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi` being executed via `.replace()` against the entire `document.body.innerHTML`. This caused severe performance degradation (taking over 2 seconds) on pages with exceptionally large `<script>` tags, making it exploitable. Fixed by replacing the regex strip operation with a native DOM `TreeWalker` to securely extract relevant text nodes and element attributes instead.

## 2026-08-24 - Restrict Popup-Only Actions to Extension Context
**Vulnerability:** The `background.js` script listens for messages on `browser.runtime.onMessage` and executes actions such as `download_images_bulk`, `download_svg`, and `cancel_downloads` unconditionally, regardless of the message sender. Since content scripts run with `<all_urls>` and can send messages, a compromised page or malicious script could send messages to trigger these actions, potentially causing denial of service (canceling downloads) or unauthorized actions (triggering bulk downloads or SVG generation) by spoofing popup actions.
**Learning:** Handlers for `browser.runtime.onMessage` must validate the sender to ensure that actions meant only for the extension's internal UI (like the popup) cannot be invoked by content scripts (which act as an untrusted boundary).
**Prevention:** Always verify `sender.tab` for messages handled in the background script. If `sender.tab` is present, the message originated from a content script and should be restricted to allowlisted actions (e.g., `download_image`).

## 2026-08-27 - onConnect Sender Verification Is a Non-Finding (Do Not Re-Investigate)
**Vulnerability:** None. Two Warden runs on 2026-08-27 (sessions 14823868967276739594 and 337129327065970397) independently flagged the `browser.runtime.onConnect` handler in `content.js` for not verifying the connecting port, and both correctly concluded no-op.
**Learning:** A web page cannot open a port to this extension at all. `externally_connectable` is declared in neither `manifest.chrome.json` nor `manifest.firefox.json`, and without it `runtime.connect` is not exposed to page context — the only callers that can reach `onConnect` are the extension's own popup and background. Sender validation still matters on `runtime.onMessage`, where content scripts *are* a real caller; that boundary is enforced and journalled directly above (2026-08-24, commit 98f76e1).
**Prevention:** Before reporting a missing sender check, confirm the channel is reachable from page context in the first place. If `externally_connectable` is absent, `onConnect` is not. Re-open this only if a manifest change adds it.

## 2026-08-28 - activeTab Permission is a Required Non-Finding
**Vulnerability:** None. It might appear that the `activeTab` permission (`manifest.chrome.json:42`, `manifest.firefox.json:46`) is redundant since the extension also requests `<all_urls>` host permissions. However, removing it is not a permissions creep fix.
**Learning:** If users restrict the extension's site access to "On click" in their browser, the `<all_urls>` grant is withheld. In that state, `activeTab` is the only mechanism that temporarily re-grants host access to the active tab when the toolbar action is clicked. Removing it silently breaks the extension for these users without changing the store warning. Furthermore, `activeTab` expands the attack surface by exactly zero when `<all_urls>` is already held.
**Prevention:** Do not remove the `activeTab` permission. Consider permissions that are strict subsets of held permissions as informational at most, not HIGH severity findings. Always evaluate how users might manually restrict permissions before considering a manifest permission "redundant."

## 2026-08-29 - Defense-in-depth: Centralized URL Validation and ZIP Hardening
**Vulnerability:** None (Enhancement). The sweep came back clean.
**Action:** Added threat-model comments at trust boundaries and centralized the `http:`/`https:` protocol allowlist in `src/background.js` into a `getSafeDownloadUrl` helper for maintainability.
**Prevention:** The `build.sh` zip exclusions modification was deferred as the current script produces no dotfiles and modifying build tooling falls outside the triage runner's immediate scope.
