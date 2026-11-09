const fs = require('fs');

global.importScripts = () => {};

describe('background trust boundaries (sender.tab)', () => {
  let messageListener;

  beforeEach(() => {
    messageListener = null;
    jest.resetModules();

    global.browser = {
      storage: {
        local: {
          get: async () => ({}),
          set: async () => {},
          remove: async () => {}
        }
      },
      runtime: { onMessage: { addListener: (cb) => { messageListener = cb; } } },
      downloads: {
        download: async () => 1,
        cancel: async () => {},
        onChanged: { addListener: () => {} }
      },
      action: { setBadgeText: async () => {} }
    };

    require('../src/background.js');
  });

  it('rejects popup-only actions from content scripts', async () => {
    const sender = { tab: { id: 1, url: 'https://example.com' } };

    let res = await messageListener({ action: 'download_images_bulk', urls: [] }, sender);
    expect(res).toEqual({ success: false, error: 'Unauthorized sender' });

    res = await messageListener({ action: 'download_svg', markup: '<svg></svg>' }, sender);
    expect(res).toEqual({ success: false, error: 'Unauthorized sender' });

    res = await messageListener({ action: 'cancel_downloads' }, sender);
    expect(res).toEqual({ success: false, error: 'Unauthorized sender' });
  });

  it('allows popup-only actions from extension context (no tab)', async () => {
    const sender = { id: 'extension_id' }; // no sender.tab
    global.browser.downloads.download = jest.fn().mockResolvedValue(123);

    let res = await messageListener({ action: 'download_images_bulk', urls: [] }, sender);
    expect(res).toEqual({ started: true, completed: true });
    expect(global.browser.downloads.download).not.toHaveBeenCalled();

    const validSvg = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
    res = await messageListener({ action: 'download_svg', markup: validSvg }, sender);
    expect(res).toEqual({ success: true });
    expect(global.browser.downloads.download).toHaveBeenCalled();
  });
});
