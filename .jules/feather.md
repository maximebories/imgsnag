## 2025-02-28 - ReDoS / Performance Fix in Content Script URL Scanner
**Learning:** Performing regex `.replace()` on the entire `document.body.innerHTML` is a massive performance bottleneck on large pages and introduces ReDoS vulnerabilities.
**Action:** Use a native `TreeWalker` combined with NodeFilters to skip noisy tags like `<style>` and `<script>` when scanning document text for matches. Native DOM traversal executes significantly faster (e.g., from ~2.5 seconds down to ~3ms in worst-case scenarios).
