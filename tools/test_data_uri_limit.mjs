#!/usr/bin/env node
// imgsnag data URI limits empirical test
// Verifies that Chrome's downloads.download API accepts a data URI
// whose length exceeds 6MB (the maximum possible expansion of a 2MiB inline SVG payload).

import { chromium } from 'playwright';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

(async () => {
  console.log('Testing Chrome downloads.download data URI limits...');

  const OUT = mkdtempSync(path.join(os.tmpdir(), 'imgsnag-test-chrome-limit-'));
  const EXT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'chrome');

  const ctx = await chromium.launchPersistentContext(path.join(OUT, 'profile'), {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    acceptDownloads: true
  });

  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 10000 });

  // A 2 MiB string of spaces maxes out the encodeURIComponent expansion (~6 MiB).
  const maxMarkupSpaces = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' + ' '.repeat(2 * 1024 * 1024 - 100) + '</svg>';

  try {
    const res = await sw.evaluate(async (m) => {
      return await new Promise(resolve => {
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(m);
        chrome.downloads.download({ url, filename: 'imgsnag-inline.svg' }, (id) => {
          if (chrome.runtime.lastError) {
             resolve({ success: false, error: chrome.runtime.lastError.message });
          } else {
             resolve({ success: true, id, urlLength: url.length });
          }
        });
      });
    }, maxMarkupSpaces);

    console.log(`Payload size: ${maxMarkupSpaces.length} bytes`);
    if (res.success) {
      console.log(`PASS: Chrome accepted data URI of length ${res.urlLength} bytes (download ID: ${res.id})`);
    } else {
      console.error(`FAIL: Chrome rejected data URI: ${res.error}`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error during evaluation:`, e.message);
    process.exit(1);
  } finally {
    await ctx.close().catch(() => {});
  }
})();
