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
