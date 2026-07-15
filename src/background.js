// imgsnag — Background Service Worker

if (typeof importScripts === 'function') {
  importScripts('lib/browser-polyfill.min.js');
}

const activeDownloadIds = new Set();

function isSafeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch (err) {
    return false;
  }
}

// Messages from popup and content script
browser.runtime.onMessage.addListener((message, _sender) => {
  if (message.action === 'download_image') {
    if (!isSafeUrl(message.url)) {
      console.warn('[imgsnag] Blocked unsafe URL:', message.url);
      return Promise.resolve({ success: false, error: 'Unsafe URL protocol' });
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
    const urls = message.urls.filter(isSafeUrl);
    const total = urls.length;

    if (total === 0) {
      console.warn('[imgsnag] No safe URLs to download.');
      return Promise.resolve({ started: false, error: 'No safe URLs to download' });
    }

    (async () => {
      for (let i = 0; i < urls.length; i++) {
        browser.action.setBadgeText({ text: `${i + 1}/${total}` });
        try {
          const downloadId = await browser.downloads.download({ url: urls[i] });
          activeDownloadIds.add(downloadId);
        } catch (err) {
          console.warn('[imgsnag] Download failed:', urls[i], err.message);
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
