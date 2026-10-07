const puppeteer = require('puppeteer');
const fs = require('fs');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  const html = fs.readFileSync('src/popup.html', 'utf8');
  let mockHtml = html.replace('<script src="lib/browser-polyfill.min.js"></script>', '').replace('<script src="popup.js"></script>', '');

  await page.setViewport({ width: 400, height: 500 });

  const langs = ['en', 'es', 'fr'];
  const counts = [0, 99];

  for (const lang of langs) {
    const messages = JSON.parse(fs.readFileSync(`_locales/${lang}/messages.json`, 'utf8'));

    for (const count of counts) {
      let counterText = '';
      if (count > 0) {
        counterText = lang === 'en' ? `${count} selected` : (lang === 'es' ? `${count} seleccionados` : `${count} sélectionnés`);
      }
      const selText = messages['popupDownloadSelected'].message.replace('$COUNT$', count.toString()).replace('$1', count.toString());
      const allText = messages['popupDownloadAll'].message.replace('$COUNT$', count.toString()).replace('$1', count.toString());
      const shortcutText = messages['popupShortcutKbd'].message.replace('$MODIFIER$', 'Ctrl').replace('$1', 'Ctrl');

      await page.setContent(`
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            ${mockHtml.split('<style>')[1].split('</style>')[0]}
            body { margin: 0; padding: 0; overflow: hidden; width: 400px; }
            #bar { display: flex !important; flex-wrap: nowrap !important; }
            #counter { flex: 0 1 auto; }
          </style>
        </head>
        <body>
          <div id="bar">
            <span id="counter" aria-live="polite" aria-atomic="true">${counterText}</span>
            <div class="actions">
              <button id="btn-selected">${selText}</button>
              <button id="btn-all">${allText}</button>
              <kbd id="shortcut-hint" style="display: inline-block;">${shortcutText}</kbd>
            </div>
          </div>
        </body>
        </html>
      `);

      const dims = await page.evaluate(() => {
        const bar = document.getElementById('bar');
        const actions = document.querySelector('.actions');
        const counter = document.getElementById('counter');

        return {
          bar: { h: bar.offsetHeight, w: bar.offsetWidth },
          actions: { h: actions.offsetHeight, w: actions.offsetWidth, sw: actions.scrollWidth },
          counter: { w: counter.offsetWidth, sw: counter.scrollWidth }
        };
      });

      console.log(`[${lang}] count=${count} with nowrap`);
      console.log(`  bar height: ${dims.bar.h}px`);
      console.log(`  actions width: ${dims.actions.w}px (scroll: ${dims.actions.sw}px)`);
      console.log(`  counter width: ${dims.counter.w}px (scroll: ${dims.counter.sw}px)`);
    }
  }

  await browser.close();
})();
