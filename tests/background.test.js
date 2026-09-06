const fs = require('fs');
const bgScript = fs.readFileSync('src/background.js', 'utf8');

describe('background.js batching', () => {
  beforeEach(() => {
    jest.resetModules();
    global.browser = {
      downloads: {
        download: jest.fn().mockImplementation(async ({ url }) => {
          // Mock download to return an id based on url
          const match = url.match(/image(\d+)\.jpg/);
          const id = match ? parseInt(match[1], 10) : 0;
          return id;
        }),
        onChanged: { addListener: jest.fn() },
        cancel: jest.fn().mockResolvedValue()
      },
      storage: {
        local: {
          get: jest.fn().mockResolvedValue({}),
          set: jest.fn().mockResolvedValue(),
          remove: jest.fn().mockResolvedValue()
        }
      },
      runtime: {
        onMessage: { addListener: jest.fn() }
      },
      action: { setBadgeText: jest.fn().mockResolvedValue() }
    };
    global.importScripts = jest.fn();

    // Evaluate background script in the global context
    eval(bgScript);
  });

  it('batches multiple concurrent addActiveDownloadId calls', async () => {
    // Simulate bulk download message
    const urls = Array.from({ length: 100 }).map((_, i) => "https://example.com/image" + i + ".jpg");
    const listener = global.browser.runtime.onMessage.addListener.mock.calls[0][0];

    const p = listener({ action: 'download_images_bulk', urls }, {});
    await p; // Wait for the bulk download handler to finish

    // In a single tick/microtask loop, 100 requests should be batched.
    // Assert number of calls to storage.local.set is far fewer than 100
    const setCalls = global.browser.storage.local.set.mock.calls;
    expect(setCalls.length).toBeLessThan(100);
    expect(setCalls.length).toBeGreaterThan(0);

    // Collect all arguments passed to set
    let finalState = {};
    for (const call of setCalls) {
      Object.assign(finalState, call[0]);
    }

    // Expect all 100 ids to be persisted in the batch(es)
    for (let i = 0; i < 100; i++) {
      expect(finalState["dl_" + i]).toBe(true);
    }
  });
});
