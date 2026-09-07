// Coalesced `dl_<id>` writes in the bulk-download path.
//
// The property that matters is DURABILITY, not the write count: those keys exist
// so `cancel_downloads` survives service-worker suspension. Batching is only
// legal because `addActiveDownloadId` awaits its flush and `onMessage` returns
// that promise, so the worker cannot be evicted with ids still buffered in the
// module-level coalescing map. These tests assert against what is READABLE FROM
// STORAGE afterwards, so they keep holding if the batching shape changes.
global.importScripts = () => {};

describe('bulk download id persistence', () => {
  let messageListener;
  let setCallCount;

  beforeEach(() => {
    messageListener = null;
    setCallCount = 0;
    jest.resetModules();

    global.mockStorage = {};
    global.browser = {
      storage: {
        local: {
          get: async () => global.mockStorage,
          set: async (obj) => {
            setCallCount++;
            // Resolve on a macrotask so a same-microtask batch is observable:
            // anything still buffered when this settles would be a lost write.
            await new Promise((r) => setTimeout(r, 0));
            global.mockStorage = { ...global.mockStorage, ...obj };
          },
          remove: async (keys) => {
            const ks = Array.isArray(keys) ? keys : [keys];
            ks.forEach((k) => delete global.mockStorage[k]);
          }
        }
      },
      runtime: { onMessage: { addListener: (cb) => { messageListener = cb; } } },
      downloads: {
        download: async ({ url }) => parseInt(url.match(/image(\d+)\.jpg/)[1], 10),
        cancel: async () => {},
        onChanged: { addListener: () => {} }
      },
      action: { setBadgeText: async () => {} }
    };

    require('../src/background.js');
  });

  it('persists every id from a concurrent bulk download', async () => {
    const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/image${i}.jpg`);

    await messageListener({ action: 'download_images_bulk', urls }, {});

    // Durability: every id is readable from storage once the handler resolves.
    for (let i = 0; i < 100; i++) {
      expect(global.mockStorage[`dl_${i}`]).toBe(true);
    }
  });

  it('coalesces those writes into far fewer than one set() per id', async () => {
    const urls = Array.from({ length: 100 }, (_, i) => `https://example.com/image${i}.jpg`);

    await messageListener({ action: 'download_images_bulk', urls }, {});

    expect(setCallCount).toBeGreaterThan(0);
    expect(setCallCount).toBeLessThan(100);
  });

  it('leaves nothing buffered — cancel_downloads sees every id', async () => {
    const urls = Array.from({ length: 25 }, (_, i) => `https://example.com/image${i}.jpg`);
    const cancelled = [];
    global.browser.downloads.cancel = async (id) => { cancelled.push(id); };

    await messageListener({ action: 'download_images_bulk', urls }, {});
    await messageListener({ action: 'cancel_downloads' }, {});

    expect(cancelled.sort((a, b) => a - b)).toEqual(
      Array.from({ length: 25 }, (_, i) => i)
    );
    expect(Object.keys(global.mockStorage).filter((k) => k.startsWith('dl_'))).toEqual([]);
  });
});
