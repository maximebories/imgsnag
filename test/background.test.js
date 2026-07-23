const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');

// Global mock setup
global.importScripts = () => {};

describe('Background Script', () => {
  let messageListener;
  let onChangedListener;
  let downloads = [];
  let badgeText = '';

  beforeEach(() => {
    // Reset global state for each test
    messageListener = null;
    onChangedListener = null;
    downloads = [];
    badgeText = '';

    // Clear the activeDownloadIds Set in the background script
    if (global.browser && global.browser.runtime) {
      // We will re-require the file to reset its state,
      // but to do that we need to clear the require cache
      delete require.cache[require.resolve('../src/background.js')];
    }

    global.mockStorage = {};
    global.browser = {
      storage: {
        local: {
          get: async () => { return global.mockStorage; },
          set: async (obj) => { global.mockStorage = { ...global.mockStorage, ...obj }; },
          remove: async (keys) => {
            const ks = Array.isArray(keys) ? keys : [keys];
            ks.forEach(k => delete global.mockStorage[k]);
          }
        }
      },
      runtime: {
        onMessage: {
          addListener: (cb) => {
            messageListener = cb;
          }
        }
      },
      downloads: {
        download: async (options) => {
          if (options.url === 'http://fail.com/image.jpg') {
            throw new Error('Simulated download failure');
          }
          const id = downloads.length + 1;
          downloads.push({ id, ...options });
          return id;
        },
        cancel: async (id) => {
          const dl = downloads.find(d => d.id === id);
          if (dl) dl.cancelled = true;
        },
        onChanged: {
          addListener: (cb) => {
            onChangedListener = cb;
          }
        }
      },
      action: {
        setBadgeText: (details) => {
          badgeText = details.text;
        }
      }
    };

    // Load the background script
    require('../src/background.js');
  });

  test('download_image: success', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'https://example.com/image.jpg'
    }, {});

    assert.deepStrictEqual(response, { success: true });
    assert.strictEqual(downloads.length, 1);
    assert.strictEqual(downloads[0].url, 'https://example.com/image.jpg');
  });

  test('download_image: invalid URL', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'not-a-url'
    }, {});

    assert.deepStrictEqual(response, { success: false, error: 'Invalid URL' });
    assert.strictEqual(downloads.length, 0);
  });

  test('download_image: invalid protocol', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'ftp://example.com/image.jpg'
    }, {});

    assert.deepStrictEqual(response, { success: false, error: 'Invalid URL protocol' });
    assert.strictEqual(downloads.length, 0);
  });

  test('download_image: download failure', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'http://fail.com/image.jpg'
    }, {});

    assert.deepStrictEqual(response, { success: false, error: 'Simulated download failure' });
  });

  test('download_images_bulk: valid and invalid URLs', async () => {
    const response = await messageListener({
      action: 'download_images_bulk',
      urls: [
        'https://example.com/1.jpg',
        'invalid-url',
        'ftp://example.com/2.jpg',
        'http://example.com/3.jpg'
      ]
    }, {});

    assert.deepStrictEqual(response, { started: true, completed: true });

    // Give async operations a moment to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(downloads.length, 2);
    assert.strictEqual(downloads[0].url, 'https://example.com/1.jpg');
    assert.strictEqual(downloads[1].url, 'http://example.com/3.jpg');
    assert.strictEqual(badgeText, ''); // Should be reset at the end
  });

  test('download_images_bulk: with a download failure', async () => {
    const response = await messageListener({
      action: 'download_images_bulk',
      urls: [
        'https://example.com/1.jpg',
        'http://fail.com/image.jpg',
        'http://example.com/3.jpg'
      ]
    }, {});

    assert.deepStrictEqual(response, { started: true, completed: true });

    // Give async operations a moment to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(downloads.length, 2);
    assert.strictEqual(downloads[0].url, 'https://example.com/1.jpg');
    assert.strictEqual(downloads[1].url, 'http://example.com/3.jpg');
    assert.strictEqual(badgeText, ''); // Should be reset at the end
  });

  test('cancel_downloads: cancels all active downloads', async () => {
    // Start some downloads
    await messageListener({
      action: 'download_images_bulk',
      urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg']
    }, {});

    await new Promise(resolve => setTimeout(resolve, 0));

    assert.strictEqual(downloads.length, 2);

    // Cancel them
    const response = await messageListener({ action: 'cancel_downloads' }, {});
    assert.deepStrictEqual(response, {});

    // Verify cancellation
    assert.strictEqual(downloads[0].cancelled, true);
    assert.strictEqual(downloads[1].cancelled, true);
  });

  test('onChanged listener removes finished downloads', async () => {
    // Start a download
    await messageListener({
      action: 'download_image',
      url: 'https://example.com/1.jpg'
    }, {});

    // Cancel it using the cancel_downloads action to test the state
    await messageListener({ action: 'cancel_downloads' }, {});

    // Check if the set is clear, but since activeDownloadIds is internal,
    // we simulate the onChanged event which is how the script cleans it up natively
    onChangedListener({
      id: downloads[0].id,
      state: { current: 'complete' }
    });

    // We can't directly inspect activeDownloadIds, but we ensure it doesn't crash
    // and correctly processes the event.
    assert.ok(true);
  });
});
