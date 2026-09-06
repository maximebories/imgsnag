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

    // Reset the module registry so re-requiring background.js re-runs its
    // top-level listener registration against the fresh mocks below
    jest.resetModules();

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
        // Async like the real API (background.js chains .catch on it).
        // Chrome clears the badge on `text: null`; mirror that as ''.
        setBadgeText: async (details) => {
          badgeText = details.text ?? '';
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

    expect(response).toEqual({ success: true });
    expect(downloads).toHaveLength(1);
    expect(downloads[0].url).toBe('https://example.com/image.jpg');
  });

  test('rejects popup-only actions from content script', async () => {
    const actions = ['download_images_bulk', 'download_svg', 'cancel_downloads'];
    const sender = { tab: { id: 1 } }; // Content script has sender.tab

    for (const action of actions) {
      const response = await messageListener({ action, url: 'http://test' }, sender);
      expect(response).toEqual({ success: false, error: 'Unauthorized sender' });
    }
  });

  test('accepts download_image from content script', async () => {
    const sender = { tab: { id: 1 } };
    const response = await messageListener({
      action: 'download_image',
      url: 'https://example.com/image.jpg'
    }, sender);
    expect(response).toEqual({ success: true });
  });


  test('download_image: normalizes URL to prevent parser differentials', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'HTTP://ExAmPlE.com:80/a/../b/image.jpg'
    }, {});

    expect(response).toEqual({ success: true });
    expect(downloads).toHaveLength(1);
    expect(downloads[0].url).toBe('http://example.com/b/image.jpg');
  });

  test('download_image: strips surrounding whitespace before normalizing', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: '  https://example.com/path/../image.jpg  '
    }, {});

    expect(response).toEqual({ success: true });
    expect(downloads).toHaveLength(1);
    expect(downloads[0].url).toBe('https://example.com/image.jpg');
  });

  test('download_images_bulk: normalizes URLs to prevent parser differentials', async () => {
    const response = await messageListener({
      action: 'download_images_bulk',
      urls: [
        'HTTP://ExAmPlE.com:80/a/../b/1.jpg',
        'https://example.com/2.jpg\n'
      ]
    }, {});

    expect(response).toEqual({ started: true, completed: true });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(downloads).toHaveLength(2);
    expect(downloads[0].url).toBe('http://example.com/b/1.jpg');
    expect(downloads[1].url).toBe('https://example.com/2.jpg');
  });

  test('download_image: invalid URL', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'not-a-url'
    }, {});

    expect(response).toEqual({ success: false, error: 'Invalid URL or protocol' });
    expect(downloads).toHaveLength(0);
  });

  test('download_image: invalid protocol', async () => {
    // Note: content.js intentionally allows blob: and data: for its own parsing,
    // but the background allowlist rejects them before calling the download API.
    const invalidUrls = [
      'ftp://example.com/image.jpg',
      'javascript:alert(1)',
      'file:///etc/passwd',
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
      'blob:https://example.com/12345678-1234-1234-1234-1234567890ab'
    ];

    for (const url of invalidUrls) {
      const response = await messageListener({
        action: 'download_image',
        url
      }, {});
      expect(response).toEqual({ success: false, error: 'Invalid URL or protocol' });
    }
    expect(downloads).toHaveLength(0);
  });

  test('download_image: download failure', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'http://fail.com/image.jpg'
    }, {});

    expect(response).toEqual({ success: false, error: 'Simulated download failure' });
  });

  test('download_images_bulk: valid and invalid URLs', async () => {
    const setBadgeTextSpy = jest.spyOn(global.browser.action, 'setBadgeText');

    const response = await messageListener({
      action: 'download_images_bulk',
      urls: [
        'https://example.com/1.jpg',
        'invalid-url',
        'ftp://example.com/2.jpg',
        'http://example.com/3.jpg'
      ]
    }, {});

    expect(response).toEqual({ started: true, completed: true });

    // Give async operations a moment to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(downloads).toHaveLength(2);
    expect(downloads[0].url).toBe('https://example.com/1.jpg');
    expect(downloads[1].url).toBe('http://example.com/3.jpg');

    // Total should be 2 (the valid URLs), not 4 (the input length)
    expect(setBadgeTextSpy).toHaveBeenCalledWith({ text: '1/2' });
    expect(setBadgeTextSpy).toHaveBeenCalledWith({ text: '2/2' });

    expect(badgeText).toBe(''); // Should be reset at the end
    setBadgeTextSpy.mockRestore();
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

    expect(response).toEqual({ started: true, completed: true });

    // Give async operations a moment to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(downloads).toHaveLength(2);
    expect(downloads[0].url).toBe('https://example.com/1.jpg');
    expect(downloads[1].url).toBe('http://example.com/3.jpg');
    expect(badgeText).toBe(''); // Should be reset at the end
  });

  test('download_svg: valid markup downloads with a generated filename', async () => {
    const response = await messageListener({
      action: 'download_svg',
      markup: '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    }, {});

    expect(response).toEqual({ success: true });
    expect(downloads).toHaveLength(1);
    // jsdom has no URL.createObjectURL, so the data: fallback path is exercised
    expect(downloads[0].url.startsWith('data:image/svg+xml')).toBe(true);
    expect(downloads[0].filename).toBe('imgsnag-inline.svg');
    expect(global.mockStorage).toHaveProperty('dl_1');
  });

  test('download_svg: rejects payloads that are not SVG markup', async () => {
    for (const markup of ['<script>alert(1)</script>', '', 'hello', 42, null, '<svg'.padEnd(2 * 1024 * 1024 + 5, 'a')]) {
      const response = await messageListener({ action: 'download_svg', markup }, {});
      expect(response).toEqual({ success: false, error: 'Invalid SVG payload' });
    }
    expect(downloads).toHaveLength(0);
  });

  test('cancel_downloads: cancels all active downloads', async () => {
    // Start some downloads
    await messageListener({
      action: 'download_images_bulk',
      urls: ['https://example.com/1.jpg', 'https://example.com/2.jpg']
    }, {});

    await new Promise(resolve => setTimeout(resolve, 0));

    expect(downloads).toHaveLength(2);

    // Cancel them
    const response = await messageListener({ action: 'cancel_downloads' }, {});
    expect(response).toEqual({});

    // Verify cancellation
    expect(downloads[0].cancelled).toBe(true);
    expect(downloads[1].cancelled).toBe(true);
  });

  test('download_images_bulk: badge-clear parity falls back to empty string if null throws', async () => {
    // Override the mock for this specific test to simulate Chrome's behavior where null throws
    const originalSetBadgeText = global.browser.action.setBadgeText;
    const setBadgeCalls = [];
    global.browser.action.setBadgeText = async (details) => {
      setBadgeCalls.push(details.text);
      if (details.text === null) {
        throw new TypeError('Simulated Chrome TypeError for null badge text');
      }
      return originalSetBadgeText(details);
    };

    const response = await messageListener({
      action: 'download_images_bulk',
      urls: ['https://example.com/1.jpg']
    }, {});

    expect(response).toEqual({ started: true, completed: true });

    // Wait for the async operations to settle
    await new Promise(resolve => setTimeout(resolve, 0));

    // Verify it attempted null, failed, and fell back to empty string
    expect(setBadgeCalls).toContain(null);
    expect(badgeText).toBe('');

    // Restore mock
    global.browser.action.setBadgeText = originalSetBadgeText;
  });

  test('onChanged listener removes finished downloads', async () => {
    // Start a download
    await messageListener({
      action: 'download_image',
      url: 'https://example.com/1.jpg'
    }, {});

    expect(global.mockStorage).toHaveProperty('dl_1');

    // Simulate the onChanged event which is how the script cleans up
    // its persisted tracking entries natively
    onChangedListener({
      id: downloads[0].id,
      state: { current: 'complete' }
    });

    // removeActiveDownloadId is async; let it settle
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(global.mockStorage).not.toHaveProperty('dl_1');
  });

  test('storage-backed download tracking pins active downloads to storage.local', async () => {
    // 1. Verify storage is initially empty
    expect(global.mockStorage).toEqual({});

    // 2. Start bulk download
    await messageListener({
      action: 'download_images_bulk',
      urls: ['https://example.com/a.jpg', 'https://example.com/b.jpg']
    }, {});

    await new Promise(resolve => setTimeout(resolve, 0));

    // 3. Verify storage has dl_1 and dl_2
    expect(global.mockStorage).toHaveProperty('dl_1', true);
    expect(global.mockStorage).toHaveProperty('dl_2', true);

    // 4. Cancel downloads
    await messageListener({ action: 'cancel_downloads' }, {});
    await new Promise(resolve => setTimeout(resolve, 0));

    // 5. Verify storage is cleared
    expect(global.mockStorage).not.toHaveProperty('dl_1');
    expect(global.mockStorage).not.toHaveProperty('dl_2');
  });
});
