## 2026-08-19 - Inline SVG serialization capture (first RFC)
**Learning:** Inline `<svg>` is the first derived-file channel: the pipeline is URL-plumbing end to end, so capture requires XMLSerializer→blob→download, inverting the SVG size-exemption (rendered getBoundingClientRect size IS measurable for inline, unlike external SVG intrinsic size). Key hazards: `<use>` refs serialize empty, external CSS/currentColor do not survive, and SVG may embed scripts — output must only ever be treated as an image.
**Action:** Verdict GO, staged — RFC #118. Keep derived-file channels on-demand only (popup-open/Alt+Click); never enumerate during ambient discovery.
## 2026-08-21 - Shadow DOM traversal RFC (filed #135) — and a deliverable-shape correction
**Learning:** Two runs (Aug 20/21) both investigated shadow DOM and both delivered the RFC as a PR with a markdown file, violating the RFC-issue deliverable; they also duplicated each other because the duplicate check skipped closed/open PRs of the persona itself. Evidence quality was good (MDN: 3 hidden images, ~0.2ms walk cost; jsdom 50k-node benchmark 360ms → keep off hot paths).
**Action:** The RFC deliverable is an issue with the `rfc` label — never a PR, never a committed .md file. Search existing rfc issues AND recent PRs before starting.
## 2026-08-22 - CSS content/mask-image RFC (filed #138 by orchestrator)
**Learning:** CSS `content: url()` and `mask-image` are viable capture channels but sit on the getComputedStyle hot path; pseudo-elements triple the style-resolution cost per element. The session sandbox has no gh auth — RFC issues must be filed by the orchestrator from the journal/message when a run cannot reach GitHub.
**Action:** Any implementation must ride the existing idle-time queue and the styling-hint fast path; element styles first, pseudo-elements only with real-page evidence.
## 2026-08-28 - blob: URLs / canvas.toBlob() extraction RFC
**Learning:** `canvas.toBlob()` is another derived-file channel. It can capture images rendered on `<canvas>` (e.g., WebGL, custom image viewers). However, `<canvas>` elements are prone to being "tainted" by cross-origin data, leading to `SecurityError` when calling `toBlob()`. Furthermore, enumerating and serializing every canvas ambiently is extremely expensive. Like inline SVG, it must be strictly on-demand (e.g., triggered by popup open or Alt+Click).
**Action:** Verdict GO, staged. Keep derived-file channels on-demand only (Alt+Click / popup open); never enumerate during ambient discovery.

## 2026-09-01 - Same-origin iframe descent RFC
**Learning:** Content script misses media in iframes because all_frames is false. Same-origin iframes can be trivially accessed via iframe.contentDocument within the existing script, avoiding the heavy all_frames: true tax.
**Action:** Verdict GO, staged. Traverse same-origin contentDocument with try/catch guards.

## 2026-09-04 - Streaming manifests: HLS .m3u8 / DASH .mpd (RFC filed by orchestrator)
**Learning:** Streaming manifests (HLS `.m3u8`, DASH `.mpd`) are already partially caught if they appear in `<video src>`, but for MSE-driven players (HLS.js, Dash.js), the manifests are fetched via XHR/fetch and played through a `blob:` URL. While `PerformanceObserver` or network interception could theoretically catch the manifest URLs, "downloading" a manifest just yields a text file of chunk URLs, not a playable video file. Re-assembling the TS/M4S chunks into a standard MP4 requires a full client-side muxer (like ffmpeg.wasm), which is vastly out of scope for a lightweight capture extension.
**Action:** Verdict NO-GO. Do not attempt to capture or parse streaming manifests. Leave them out of scope.
