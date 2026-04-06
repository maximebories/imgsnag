// imgsnag — Background Service Worker

if (typeof importScripts === 'function') {
  importScripts('lib/browser-polyfill.min.js');
}

const activeDownloadIds = new Set();

// Toolbar button toggles between starting a bulk search and aborting it
browser.action.onClicked.addListener(async (tab) => {
  const { isSearchActive } = await browser.storage.session.get(['isSearchActive']);

  if (isSearchActive) {
    browser.tabs.sendMessage(tab.id, { action: 'stop_downloads' });
  } else {
    await browser.storage.session.set({ isSearchActive: true });

    browser.action.setBadgeText({
      text: browser.i18n.getMessage('buttonTitle'),
    });

    browser.tabs.sendMessage(tab.id, { action: 'search_images' });
  }
});

// Messages from content script
browser.runtime.onMessage.addListener((message, _sender) => {
  if (message.action === 'update_badge') {
    browser.action.setBadgeText({ text: message.text });
    if (!message.inProgress) {
      browser.storage.session.set({ isSearchActive: false });
    }
    return Promise.resolve({});
  }

  if (message.action === 'download_image') {
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
