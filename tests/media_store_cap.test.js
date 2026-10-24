const { addNewUrls, MAX_TRACKED_MEDIA } = require('../src/content.js');

// `discoveredMedia` deliberately outlives the DOM nodes it was built from, so
// infinite scroll can recycle nodes without losing found media. Nothing else
// bounds it — MAX_TRACKED_MEDIA is the only thing standing between a page that
// scrolls forever and a content script that grows forever.
//
// Driven with `type: 'video'` on purpose: videos skip size filtering entirely,
// so this exercises the store cap without dragging in `new Image()` probing.
function connectPopup() {
  const postMessage = jest.fn();
  const listener = browser.runtime.onConnect.addListener.mock.calls[0][0];
  listener({
    name: 'imgsnag-popup',
    postMessage,
    onDisconnect: { addListener: jest.fn() }
  });
  return postMessage;
}

function urls(from, count) {
  const set = new Set();
  for (let i = from; i < from + count; i++) set.add(`https://example.com/v${i}.mp4`);
  return set;
}

describe('media store cap', () => {
  let postMessage;

  beforeAll(() => {
    postMessage = connectPopup();
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
    postMessage.mockClear();

    await addNewUrls(urls(90000, 10), 'video');

    const announced = postMessage.mock.calls.filter(([msg]) => msg.action === 'new_images');
    expect(announced).toHaveLength(0);
  });
});

describe('pendingNetworkFilter cap', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('stops adding to pendingNetworkFilter once it reaches MAX_TRACKED_MEDIA', async () => {
    // Re-require after resetModules so we get fresh module state
    // but we need to re-mock browser completely like setup.js
    const listenerMock = jest.fn();
    global.browser = {
      runtime: {
        onConnect: { addListener: listenerMock },
        sendMessage: jest.fn().mockResolvedValue({})
      },
      storage: {
        sync: { get: jest.fn().mockResolvedValue({}) },
        local: { get: jest.fn().mockResolvedValue({}) },
        onChanged: { addListener: jest.fn() }
      }
    };

    const { filterImagesBySize, MAX_TRACKED_MEDIA } = require('../src/content.js');

    // Fill pendingNetworkFilter to its limit
    const urls1 = new Set();
    for (let i = 0; i < MAX_TRACKED_MEDIA; i++) {
      urls1.add(`https://example.com/v${i}.jpg`);
    }
    await filterImagesBySize(urls1, new Map());

    // Try to add one more to pendingNetworkFilter
    const urls2 = new Set(['https://example.com/overflow.jpg']);
    await filterImagesBySize(urls2, new Map());

    let overflowProbed = false;
    let underCapProbed = false;
    const realImage = global.Image;
    global.Image = class {
      set src(url) {
        if (url === 'https://example.com/overflow.jpg') {
          overflowProbed = true;
        }
        if (url === 'https://example.com/v0.jpg') {
          underCapProbed = true;
        }
        setTimeout(() => this.onerror(), 0);
      }
    };

    const listener = listenerMock.mock.calls[0][0];
    listener({
      name: 'imgsnag-popup',
      postMessage: jest.fn(),
      onDisconnect: { addListener: jest.fn() }
    });

    // wait for event loop to start processing the queue
    await new Promise(resolve => setTimeout(resolve, 50));

    expect(underCapProbed).toBe(true);
    expect(overflowProbed).toBe(false);

    global.Image = realImage;
  });
});
