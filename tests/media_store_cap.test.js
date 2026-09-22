// Reset modules is used inside the test to ensure fresh state for the content script
let addNewUrls, filterImagesBySize, MAX_TRACKED_MEDIA;

function urls(from, count, prefix = 'v') {
  const set = new Set();
  for (let i = from; i < from + count; i++) set.add(`https://example.com/${prefix}${i}.mp4`);
  return set;
}

function imgUrls(from, count, prefix = 'i') {
  const set = new Set();
  for (let i = from; i < from + count; i++) set.add(`https://example.com/${prefix}${i}.jpg`);
  return set;
}

describe('media store cap', () => {
  beforeEach(() => {
    jest.resetModules();
    browser.runtime.onConnect.addListener.mockClear();
    const content = require('../src/content.js');
    addNewUrls = content.addNewUrls;
    filterImagesBySize = content.filterImagesBySize;
    MAX_TRACKED_MEDIA = content.MAX_TRACKED_MEDIA;
  });

  describe('discoveredMedia', () => {
    let postMessage;

    beforeEach(() => {
      postMessage = jest.fn();
      const listener = browser.runtime.onConnect.addListener.mock.calls[0][0];
      listener({
        name: 'imgsnag-popup',
        postMessage,
        onDisconnect: { addListener: jest.fn() }
      });
    });

    it('stops admitting media at MAX_TRACKED_MEDIA', async () => {
      expect(MAX_TRACKED_MEDIA).toBe(10000);

      // One call carrying more than the whole budget: the per-item guard inside
      // the admit loop has to hold, not just the entry guard.
      await addNewUrls(urls(0, MAX_TRACKED_MEDIA + 500), 'video');

      const announced = postMessage.mock.calls
        .filter(([msg]) => msg.action === 'new_images')
        .reduce((n, [msg]) => n + msg.images.length, 0);

      expect(announced).toBe(MAX_TRACKED_MEDIA);
    });

    it('admits nothing further once the cap is reached', async () => {
      await addNewUrls(urls(0, MAX_TRACKED_MEDIA), 'video');
      postMessage.mockClear();

      await addNewUrls(urls(90000, 10), 'video');

      const announced = postMessage.mock.calls.filter(([msg]) => msg.action === 'new_images');
      expect(announced).toHaveLength(0);
    });
  });

  describe('pendingNetworkFilter', () => {
    const realImage = global.Image;

    beforeEach(() => {
      global.Image = class {
        set src(url) {
          setTimeout(() => {
            this.naturalWidth = 300;
            this.naturalHeight = 300;
            if (this.onload) this.onload();
          }, 0);
        }
      };
    });

    afterEach(() => {
      global.Image = realImage;
    });

    it('stops admitting media to pendingNetworkFilter at MAX_TRACKED_MEDIA', async () => {
      // The popup is initially disconnected (onConnect listener hasn't been fired)

      // 1. Fill exactly to MAX_TRACKED_MEDIA - 1
      await filterImagesBySize(imgUrls(0, MAX_TRACKED_MEDIA - 1, 'img'), new Map());

      // 2. Add two more. The first one should fit exactly hitting MAX_TRACKED_MEDIA, the second one drops
      await filterImagesBySize(imgUrls(MAX_TRACKED_MEDIA - 1, 2, 'img'), new Map());

      // 3. Add one more while full, should be ignored
      await filterImagesBySize(imgUrls(MAX_TRACKED_MEDIA + 1, 1, 'img'), new Map());

      // Connect the popup to flush pendingNetworkFilter
      const postMessage = jest.fn();
      const listener = browser.runtime.onConnect.addListener.mock.calls[0][0];
      listener({
        name: 'imgsnag-popup',
        postMessage,
        onDisconnect: { addListener: jest.fn() }
      });

      // Flushed images will go through new Image() probes and eventually call addNewUrls
      // Since it's async, we have to wait a tick for promises and setTimeout to resolve.
      // Give the probe pool time to drain its async queue
      await new Promise(resolve => setTimeout(resolve, 1500));

      const announced = postMessage.mock.calls
        .filter(([msg]) => msg.action === 'new_images')
        .reduce((n, [msg]) => n + msg.images.length, 0);

      expect(announced).toBe(MAX_TRACKED_MEDIA);
    });
  });
});
