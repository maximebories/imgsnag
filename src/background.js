// imgsnag — Background Service Worker

if (typeof importScripts === 'function') {
  importScripts('lib/browser-polyfill.min.js');
}

const PREFIX = 'dl_';

async function getActiveDownloadIds() {
  const data = await browser.storage.local.get();
  return Object.keys(data)
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => parseInt(k.substring(PREFIX.length), 10));
}

async function addActiveDownloadId(id) {
  await browser.storage.local.set({ [`${PREFIX}${id}`]: true });
}

async function removeActiveDownloadId(id) {
  await browser.storage.local.remove(`${PREFIX}${id}`);
}

async function clearActiveDownloadIds() {
  const ids = await getActiveDownloadIds();
  const keys = ids.map((id) => `${PREFIX}${id}`);
  if (keys.length > 0) {
    await browser.storage.local.remove(keys);
  }
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
      .then(async (downloadId) => {
        await addActiveDownloadId(downloadId);
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

    // Return the promise so the service worker stays alive; parallelize all downloads
    return (async () => {
      let completed = 0;
      await Promise.all(
        validUrls.map(async (url) => {
          try {
            const downloadId = await browser.downloads.download({ url });
            await addActiveDownloadId(downloadId);
          } catch (err) {
            console.warn('[imgsnag] Download failed:', url, err.message);
          } finally {
            completed++;
            browser.action.setBadgeText({ text: `${completed}/${total}` });
          }
        })
      );
      browser.action.setBadgeText({ text: '' });
      return { started: true, completed: true };
    })();
  }

  if (message.action === 'cancel_downloads') {
    return (async () => {
      const ids = await getActiveDownloadIds();
      for (const id of ids) {
        browser.downloads.cancel(id).catch(() => {});
      }
      await clearActiveDownloadIds();
      return {};
    })();
  }

  return false;
});

// Clean up completed/cancelled downloads from tracking
browser.downloads.onChanged.addListener((delta) => {
  if (delta.state && delta.state.current !== 'in_progress') {
    removeActiveDownloadId(delta.id);
  }
});
