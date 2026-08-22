#!/usr/bin/env node
// imgsnag E2E smoke test — loads dist/chrome into Playwright Chromium,
// opens a real page, opens the popup against that tab, and asserts the
// grid populates. Also reports a duplicate metric (cells whose underlying
// image URL differs only by query string).
//
// Usage:  node tools/e2e-smoke.mjs [url]
// Needs Playwright's Chromium: npx playwright install chromium
// Exits 0 on pass (populated grid, >0 cells), 1 on failure.

import { readdirSync, existsSync, mkdtempSync } from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* not a local dep */ }
  const base = path.join(os.homedir(), '.npm', '_npx');
  if (existsSync(base)) {
    for (const d of readdirSync(base)) {
      const p = path.join(base, d, 'node_modules', 'playwright', 'index.mjs');
      if (existsSync(p)) return await import(pathToFileURL(p).href);
    }
  }
  throw new Error('playwright not found — run: npx playwright install chromium');
}

const url = process.argv[2] ?? 'https://unsplash.com/';
const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'chrome');
const OUT = mkdtempSync(path.join(os.tmpdir(), 'imgsnag-e2e-'));

const { chromium } = await loadPlaywright();
const ctx = await chromium.launchPersistentContext(path.join(OUT, 'profile'), {
  headless: false,
  viewport: { width: 1280, height: 800 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
});

let failed = false;
try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });
  const extId = sw.url().split('/')[2];

  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(3000);
  await page.mouse.wheel(0, 2500);
  await page.waitForTimeout(2500);

  // The real action popup can't open for an OS-unfocused window, so open
  // popup.html as a tab with tabs.query stubbed to the target tab — the
  // port, content script, and rendering path stay fully real.
  const tabId = await sw.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find(t => (t.url || '').startsWith(u.slice(0, 30)))?.id ?? tabs.find(t => !t.url?.startsWith('chrome'))?.id;
  }, url);

  const popup = await ctx.newPage();
  await popup.addInitScript(id => {
    const patch = () => {
      if (globalThis.chrome && chrome.tabs) {
        chrome.tabs.query = (q, cb) => { const res = [{ id }]; return cb ? cb(res) : Promise.resolve(res); };
      }
    };
    patch(); setTimeout(patch, 0);
  }, tabId);
  await popup.setViewportSize({ width: 400, height: 560 });
  await popup.goto(`chrome-extension://${extId}/popup.html`);
  await popup.waitForTimeout(5000);

  const stats = await popup.evaluate(() => {
    const srcs = [...document.querySelectorAll('#grid img')].map(i => i.src.split('?')[0]);
    return {
      cells: document.querySelectorAll('#grid .cell').length,
      videos: document.querySelectorAll('#video-grid .cell').length,
      queryDupes: srcs.length - new Set(srcs).size,
      state: ['loading', 'empty', 'error'].find(id => document.getElementById(id)?.classList.contains('visible')) || 'populated'
    };
  });
  const shot = path.join(OUT, 'popup.png');
  await popup.screenshot({ path: shot });

  console.log(JSON.stringify({ url, extId, ...stats, screenshot: shot }, null, 2));
  if (stats.state !== 'populated' || stats.cells === 0) {
    console.error('SMOKE FAIL: grid did not populate');
    failed = true;
  }
} catch (e) {
  console.error('SMOKE FAIL:', e.message);
  failed = true;
} finally {
  await ctx.close().catch(() => {});
}
process.exit(failed ? 1 : 0);
