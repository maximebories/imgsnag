## 2026-07-19 - Hardcoded aria-label fallback replaced with i18n
**Learning:** Hardcoded strings like 'media' in `aria-label` attributes are invisible in the UI but fail accessibility testing if they don't respect the active locale.
**Action:** When adding fallback names for screen readers, route them through `browser.i18n.getMessage` just like visible strings.
## 2026-07-20 - Do not commit dist files and intermediate debugging files
**Learning:** Build artifacts like `dist/`, `.zip` files, intermediate debugging text files, and package lockfiles (like `pnpm-lock.yaml`) should never be committed to source control to keep the repo clean and zero-dependency compliant. Modifying files in `dist/` will also be overwritten during the next build.
**Action:** Only edit files in the `src/` and `_locales/` directories and run `git clean` or `git restore` to remove any generated lockfiles or text files before committing.
