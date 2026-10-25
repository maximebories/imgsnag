# ⛏️ Prospector RFC: WebVTT Thumbnail Tracks extraction

## The Gap (What we miss)
Video players (like Video.js or custom implementations) often display thumbnail previews when the user hovers over the progress bar. These thumbnails are frequently delivered via WebVTT (`.vtt`) files referenced in `<track kind="metadata">` elements inside a `<video>` tag.
The current `imgsnag` pipeline ignores `<track>` elements entirely. The image URLs contained within the VTT files never appear as `src` or `background-image` in the live DOM, meaning the structural scan misses them.

Example pattern:
```html
<video controls>
  <source src="movie.mp4" type="video/mp4">
  <track default kind="metadata" src="https://example.com/thumbnails.vtt">
</video>
```
The `thumbnails.vtt` file contains:
```vtt
WEBVTT

1
00:00:00.000 --> 00:00:10.000
https://example.com/sprite1.jpg#xywh=0,0,160,90
```

## The Mechanism (How we capture it)
We can identify `<track>` elements with `src` attributes pointing to `.vtt` files. Because `HTMLTrackElement.track.cues` may not populate cross-origin or if the track isn't actively loaded, the most robust way to extract the URLs is to fetch the `.vtt` file directly, parse the text, and extract URLs (stripping media fragment identifiers like `#xywh=...`).

**Prototype snippet (feasibility):**
```javascript
const vttText = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:10.000\nhttps://example.com/sprite.jpg#xywh=0,0,160,90";
const urls = new Set();
for (const line of vttText.split('\n')) {
  if (line.trim().startsWith('http') || line.includes('.jpg') || line.includes('.webp')) {
    let url = line.trim();
    if (url.includes('#xywh=')) url = url.split('#')[0];
    urls.add(url);
  }
}
console.log(Array.from(urls)); // ['https://example.com/sprite.jpg']
```
This channel terminates in a fetchable URL (e.g., `https://example.com/sprite.jpg`), satisfying the architectural URL handoff boundary for `browser.downloads.download`.

## Warden Section (Security & Privacy)
- **Attack surface:** Fetching VTT files introduces new network requests. To prevent the extension from being used as a cross-origin SSRF proxy, fetches MUST be initiated by the background service worker (which holds `<all_urls>`), not the content script, or explicitly handled with `credentials: 'omit'` if done in the content script (subject to CORS).
- **Validation:** The fetched payload must be strictly treated as text. The parser must only extract URLs, resolving them against the page's base URI and passing them through `resolveUrl()` to enforce the `http:`/`https:` protocol allowlist.

## Feather Section (Performance)
- **Cost budget:** Fetching a VTT file incurs a network request. It is unacceptable to fetch VTTs ambiently during the `MutationObserver` scan, as it would cause background network traffic for videos the user hasn't interacted with.
- **Hot-path impact:** Like inline SVG serialization and Web App Manifests, this extraction must be deferred until the user opens the popup (or triggers an Alt+Click download).

## False-Positive Story
The main risk is that the VTT parser might extract non-media URLs if the VTT contains links to other resources. By applying the existing `isImageUrl()` / `isVideoUrl()` checks or the `IMAGE_EXT_RE` to the extracted lines, we ensure only valid media URLs reach the grid. The existing `MIN_IMAGE_SIZE` filter will naturally cull 0x0 errors.

## Verdict
**GO, staged.**

**Implementation sketch (Stage 1 for Scout):**
1. Add `collectVttThumbnails()` to `content.js` to find `<track src>` elements.
2. Hook it into the popup connect handler (alongside `collectInlineSvgs()`).
3. Message the background script to `fetch` the VTT URLs and return the text (to bypass content script CORS limits).
4. Parse the returned text, extract valid image URLs (stripping hash fragments), and add them to `discoveredMedia`.
