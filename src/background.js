// imgsnag — Background Service Worker

if (typeof importScripts === 'function') {
  importScripts('lib/browser-polyfill.min.js');
}

// Messages from popup and content script
browser.runtime.onMessage.addListener((message, _sender) => {
  if (message.action === 'download_image') {
    try {
      const urlObj = new URL(message.url);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return Promise.resolve({ success: false, error: 'Invalid URL protocol' });
      }
    } catch (e) {
      return Promise.resolve({ success: false, error: 'Invalid URL' });
    }

    return browser.downloads
      .download({ url: message.url })
      .then((downloadId) => {
        browser.storage.local.set({ [`dl_${downloadId}`]: true });
        return { success: true };
      })
      .catch((err) => {
        console.warn('[imgsnag] Download failed:', message.url, err.message);
        return { success: false, error: err.message };
      });
  }

  if (message.action === 'download_images_bulk') {
    const urls = message.urls;
    const validUrls = [];
    for (const u of urls) {
      try {
        const urlObj = new URL(u);
        if (urlObj.protocol === 'http:' || urlObj.protocol === 'https:') {
          validUrls.push(u);
        }
      } catch (e) {
        // ignore invalid urls
      }
    }

    const total = validUrls.length;

    (async () => {
      for (let i = 0; i < validUrls.length; i++) {
        browser.action.setBadgeText({ text: `${i + 1}/${total}` });
        try {
          const downloadId = await browser.downloads.download({ url: validUrls[i] });
          browser.storage.local.set({ [`dl_${downloadId}`]: true });
        } catch (err) {
          console.warn('[imgsnag] Download failed:', validUrls[i], err.message);
        }
      }
      browser.action.setBadgeText({ text: '' });
    })();

    return Promise.resolve({ started: true });
  }

  if (message.action === 'cancel_downloads') {
    browser.storage.local.get(null).then((items) => {
      const keysToRemove = [];
      for (const key in items) {
        if (key.startsWith('dl_')) {
          const id = parseInt(key.slice(3), 10);
          if (!isNaN(id)) {
            browser.downloads.cancel(id).catch(() => {});
            keysToRemove.push(key);
          }
        }
      }
      if (keysToRemove.length > 0) {
        browser.storage.local.remove(keysToRemove);
      }
    });
    return Promise.resolve({});
  }

  return false;
});

// Clean up completed/cancelled downloads from tracking
browser.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current !== 'in_progress') {
    browser.storage.local.remove(`dl_${delta.id}`);
  }
});
