// imgsnag — Background Service Worker

if (typeof importScripts === 'function') {
  importScripts('lib/browser-polyfill.min.js');
}

const PREFIX = 'dl_';

// blob: URLs pending revocation once their download leaves in_progress.
// In-memory is correct here: a blob URL cannot outlive its creating context,
// so persisting this map across suspension would be useless anyway.
const blobUrlsByDownloadId = new Map();
const MAX_INLINE_SVG_CHARS = 2 * 1024 * 1024;

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
browser.runtime.onMessage.addListener((message) => {
  if (message.action === 'download_image') {
    try {
      const urlObj = new URL(message.url);
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return Promise.resolve({ success: false, error: 'Invalid URL protocol' });
      }
    } catch (e) {
      return Promise.resolve({ success: false, error: 'Invalid URL' });
    }

    const safeUrl = new URL(message.url).href;
    return browser.downloads
      .download({ url: safeUrl })
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
          validUrls.push(urlObj.href);
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
      browser.action.setBadgeText({ text: null }).catch(() => browser.action.setBadgeText({ text: '' }));
      return { started: true, completed: true };
    })();
  }

  if (message.action === 'download_svg') {
    // Serialized inline-SVG markup from the popup (RFC #118). The background
    // constructs the URL itself so no page-controlled URL crosses this
    // boundary; the http/https allowlist above stays untouched.
    const markup = message.markup;
    if (
      typeof markup !== 'string' ||
      markup.length === 0 ||
      markup.length > MAX_INLINE_SVG_CHARS ||
      !markup.trimStart().startsWith('<svg')
    ) {
      return Promise.resolve({ success: false, error: 'Invalid SVG payload' });
    }

    return (async () => {
      // Firefox's event page has createObjectURL; Chrome's service worker
      // does not, so fall back to a data: URL there.
      const canBlob = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
      const url = canBlob
        ? URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }))
        : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(markup);
      try {
        const downloadId = await browser.downloads.download({ url, filename: 'imgsnag-inline.svg' });
        await addActiveDownloadId(downloadId);
        if (canBlob) blobUrlsByDownloadId.set(downloadId, url);
        return { success: true };
      } catch (err) {
        if (canBlob) URL.revokeObjectURL(url);
        console.warn('[imgsnag] SVG download failed:', err.message);
        return { success: false, error: err.message };
      }
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
    // Revoke only after the download completes (see MDN downloads.download)
    const blobUrl = blobUrlsByDownloadId.get(delta.id);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      blobUrlsByDownloadId.delete(delta.id);
    }
  }
});
