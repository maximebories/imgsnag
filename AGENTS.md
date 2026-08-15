# AGENTS.md

Guidance for coding agents (Google Jules, Claude Code via `CLAUDE.md`, and others) working in this repository.

imgsnag is a cross-browser WebExtension (Chrome + Firefox, both Manifest V3) that downloads images and videos from web pages. Plain JavaScript — no framework, no bundler, no transpilation.

## Commands

```bash
bash build.sh          # build dist/{chrome,firefox}/ and dist/imgsnag-{chrome,firefox}.zip
npm test               # run all Jest tests (jsdom environment, mocks in tests/setup.js)
npx jest tests/content.test.js        # run a single test file
npx jest -t "name of test"            # run tests matching a name
node --check src/content.js           # quick syntax check (no build step exists to catch errors)
```

- `dist/` is **committed build output** — never edit it by hand; run `build.sh` and commit the regenerated files.
- CI (`.github/workflows/ci.yml`) runs syntax checks, tests, and the build on every push/PR. Releases are tag-driven (`.github/workflows/release.yml`): pushing a `vX.Y.Z` tag (which must match the `version` in **both** manifests) tests, builds, and publishes to the Chrome Web Store and addons.mozilla.org. Version bumps and tags are manual — agents never bump versions or push tags.
- Test files live in several places (`src/*.test.js`, `src/tests/`, `tests/`, `test/`); Jest picks up all of them. `tests/setup.js` provides the `browser` API mocks.

## Architecture

Three extension contexts, one shared source tree (`src/`), packaged twice by `build.sh` (only the manifest differs per browser):

1. **`src/content.js`** (runs on all pages) — media discovery.
   - Initial scan: `<img src>` + lazy-load attributes (`data-src`, `data-lazy-src`, `data-original`), `srcset`/`data-srcset`, `<picture><source>`, `<video>`/`poster`, CSS `background-image` (with a fast-path that skips unstyled elements to avoid `getComputedStyle` cost), and a TreeWalker regex sweep for URLs in JSON-LD/attributes.
   - Continuous discovery: a `MutationObserver` (added DOM nodes) and a `PerformanceObserver` (resource entries) feed the same pipeline.
   - `discoveredMedia` (a `Map`) persists found media across DOM node recycling (infinite scroll).
   - Size filter: images must be ≥ 200×200 (`MIN_IMAGE_SIZE`); SVGs and videos are exempt. Sizes come from a one-pass `document.images` cache; network probing via `new Image()` is deferred into `pendingNetworkFilter` until the popup connects.
   - Direct download paths: Alt+Click (`elementsFromPoint`, downloads the stack under the cursor) and drag-to-save (toggleable via the `disableDrag` sync-storage setting).

2. **`src/popup.js`** — opens a port named `imgsnag-popup` to the active tab's content script; receives `init` (current store) then `new_images` (live updates); renders image/video grids of clickable cells (click = download, checkbox = select for bulk).

3. **`src/background.js`** — the **only** caller of `browser.downloads.download`. Handles runtime messages `download_image`, `download_images_bulk` (badge shows `completed/total` progress), and `cancel_downloads`. Tracks in-flight download ids in `storage.local` under `dl_<id>` keys so cancellation survives service-worker suspension; `downloads.onChanged` cleans them up.

### Cross-browser parity

- All code uses the promise-based `browser.*` API via the bundled polyfill (`src/lib/browser-polyfill.min.js`).
- `manifest.chrome.json` uses `background.service_worker`; `manifest.firefox.json` uses `background.scripts` (event page) plus `browser_specific_settings.gecko`. Any manifest change must be mirrored in both files.
- MV3 lifecycle rules: return the Promise from `onMessage` listeners so the background stays alive until async work finishes; persist state in `browser.storage`, never in module-level variables.

### Security invariants (do not weaken)

- `resolveUrl()` in content.js allowlists protocols (`http:`, `https:`, `blob:`, `data:`); background.js re-validates to `http:`/`https:` only and passes the **normalized** `urlObj.href` (never the raw input string) to the downloads API — this closes a URL parser differential.
- Click/dragend handlers require `e.isTrusted` so hostile pages cannot synthesize events to force downloads.
- The extension runs on `<all_urls>`: treat every URL and attribute read from the page as hostile input.

### i18n

Every user-visible string — including `aria-label`s, `title` tooltips, and document titles — goes through `browser.i18n.getMessage`. Locales live in `_locales/{en,es,fr}/messages.json`; a new key must be added to **all three**. HTML pages get their `lang` attribute and title set dynamically at load.

## Jules agents — `jules/` definitions, `.jules/` journals

This repo is maintained by scheduled [Google Jules](https://jules.google/docs) agent personas. Two directories, one file per persona in each:

- **`jules/`** — the agent **definitions**: each persona's mission, territory, process, and boundaries.
- **`.jules/`** — the agents' append-only **action journals**: dated records of what they learned and changed.

Each persona has a fixed territory:

| Persona | Territory |
|---|---|
| `scout.md` | media detection coverage |
| `feather.md` | performance |
| `warden.md` | security & store compliance |
| `pixel.md` | UX & accessibility |
| `lingo.md` | i18n |
| `twin.md` | Chrome/Firefox parity |
| `probe.md` | test coverage & regression guards |
| `bolt.md` | generic perf template — **do not schedule** (Feather covers this repo) |
| `palette.md`, `sentinel.md` | generic UX/security templates — **do not schedule** (Pixel/Warden cover this repo) |

Entries follow a dated `**Learning:** / **Action:**` format (security journals use `**Vulnerability:** / **Fix:**`). Before changing code in one of these domains, read the matching journal — it records hard-won constraints (e.g. the ReDoS and parser-differential fixes). When you learn something durable in a territory, append an entry in the same format rather than rewriting history.

### Persona operating protocol (binding for all scheduled agents)

Historically, agents re-fixed already-landed issues (a dozen branches once existed for one URL-parser fix). This protocol exists to prevent that:

1. **Sync first.** Work from the latest `main`. Run `npm test` (all suites must be green) and `bash build.sh` to establish a working baseline before changing anything.
2. **Read your journal** (`.jules/<persona>.md`) and your definition (`jules/<persona>.md`) before starting.
3. **Duplicate check — mandatory before writing any patch:**
   - `git log --oneline -30` — has the finding already been fixed on `main`?
   - `git branch -r` — does a branch (often from a previous run of *you*) already address it?
   - Confirm the flaw exists in the **current** source by reading it — not in a stale description of it.
   - If it's already fixed or in flight: conclude **without** a patch. A no-op run is a success, not a failure.
4. **One branch per session, one focused change.** Never publish multiple branches for one finding.
5. **Before publishing:** `npm test` green, `bash build.sh` clean — but **commit only source files and your journal, never `dist/`**. Running `build.sh` dirties `dist/` in the working tree; discard those changes (`git reset` the stage, `git add` only your files, commit, then `git checkout -- dist/`). Never use `git rm --cached dist/` — dist is tracked and that commits its deletion. The orchestrator rebuilds and commits `dist/` after merging.
6. **Journal only genuinely new learnings** — check that your journal doesn't already record the same lesson.
