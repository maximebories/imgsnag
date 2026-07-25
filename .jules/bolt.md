## 2024-05-24 - Pre-computing intrinsic image sizes
**Learning:** Using `document.querySelector` in a loop to find image sizes by URL causes severe layout thrashing and O(n) performance degradation. It can also fail due to attribute-matching bugs with relative URLs.
**Action:** Always iterate over `document.images` once to pre-compute a Map of `img.src` (which returns the resolved absolute URL) to intrinsic sizes, and use that map for lookups.
