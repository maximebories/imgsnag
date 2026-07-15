// imgsnag — Background Service Worker

if (typeof importScripts === 'function') {
  importScripts('lib/browser-polyfill.min.js');
}

const activeDownloadIds = new Set();

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
        activeDownloadIds.add(downloadId);
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
          activeDownloadIds.add(downloadId);
        } catch (err) {
          console.warn('[imgsnag] Download failed:', validUrls[i], err.message);
        }
      }
      browser.action.setBadgeText({ text: '' });
    })();

    return Promise.resolve({ started: true });
  }

  if (message.action === 'cancel_downloads') {
    for (const id of activeDownloadIds) {
      browser.downloads.cancel(id).catch(() => {});
    }
    activeDownloadIds.clear();
    return Promise.resolve({});
  }

  return false;
});

// Clean up completed/cancelled downloads from tracking
browser.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current !== 'in_progress') {
    activeDownloadIds.delete(delta.id);
  }
});
