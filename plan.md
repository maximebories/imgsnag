1. Update `src/content.js` to optimize DOM image size lookups.
   - Replace `getDomImageSize(url)` with `getDomImageSizes()` which creates a Map of `img.src` -> sizes from `document.images`.
   - Update `filterImagesBySize` to accept `domSizes` map.
   - Update `addNewUrls` to compute `domSizes` once and use it for filtering and item mapping.
2. Add a learning to `.jules/bolt.md` about using `document.images` map instead of `document.querySelector` in loops.
3. Pre commit steps
   - Complete pre commit steps to make sure proper testing, verifications, reviews and reflections are done.
4. Submit
   - Create PR with title `⚡ Bolt: Optimize DOM image size lookups`.
