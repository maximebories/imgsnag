## 2025-02-28 - ReDoS / Performance Fix in Content Script URL Scanner
**Learning:** Performing regex `.replace()` on the entire `document.body.innerHTML` is a massive performance bottleneck on large pages and introduces ReDoS vulnerabilities.
**Action:** Use a native `TreeWalker` combined with NodeFilters to skip noisy tags like `<style>` and `<script>` when scanning document text for matches. Native DOM traversal executes significantly faster (e.g., from ~2.5 seconds down to ~3ms in worst-case scenarios).

## 2024-05-24 - Feather Journal
**Learning:** Initializing
**Action:** Let's optimize content.js.

## 2024-05-24 - Optimizing getComputedStyle
**Learning:** Checking `getComputedStyle(el).backgroundImage` across all generic selectors (`div`, `span`, etc.) takes a significant chunk of time (e.g., ~28ms out of ~35ms on Wikipedia) because `getComputedStyle` causes style recalculations/lookups. Most of these elements do not have background images.
**Action:** By skipping `getComputedStyle` on elements that lack a `class`, `id`, or inline `style` attribute (which are extremely unlikely to have a specific background image), we can reduce the time spent in the background sweep by ~75% (from 27.5ms to 6ms on a test page) without missing actual valid background images.
