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


  test('download_image: normalizes URL to prevent parser differentials', async () => {
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
        '  https://example.com/path/../1.jpg  ',
        'https://example.com/2.jpg\n'
      ]
    }, {});

    expect(response).toEqual({ started: true, completed: true });
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(downloads).toHaveLength(2);
    expect(downloads[0].url).toBe('https://example.com/1.jpg');
    expect(downloads[1].url).toBe('https://example.com/2.jpg');
  });

  test('download_image: invalid URL', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'not-a-url'
    }, {});

    expect(response).toEqual({ success: false, error: 'Invalid URL' });
    expect(downloads).toHaveLength(0);
  });

  test('download_image: invalid protocol', async () => {
    const response = await messageListener({
      action: 'download_image',
      url: 'ftp://example.com/image.jpg'
    }, {});

    expect(response).toEqual({ success: false, error: 'Invalid URL protocol' });
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
    expect(badgeText).toBe(''); // Should be reset at the end
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
});
