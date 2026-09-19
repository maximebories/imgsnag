const { filterImagesBySize, SIZE_PROBE_POOL_SIZE } = require('../src/content.js');

// `filterImagesBySize` only probes the network while the popup is connected —
// otherwise URLs are parked in `pendingNetworkFilter`. Drive the real
// `onConnect` handler rather than patching module state, so the test exercises
// the same path the extension does.
function connectPopup() {
  const listener = browser.runtime.onConnect.addListener.mock.calls[0][0];
  listener({
    name: 'imgsnag-popup',
    postMessage: jest.fn(),
    onDisconnect: { addListener: jest.fn() }
  });
}

describe('filterImagesBySize network-probe fan-out', () => {
  const realImage = global.Image;
  let inflight;
  let maxInflight;

  beforeAll(connectPopup);

  beforeEach(() => {
    inflight = 0;
    maxInflight = 0;
  });

  afterEach(() => {
    global.Image = realImage;
  });

  // Each probe reports the size `plan` gives it and settles after `plan`'s delay,
  // so completion order can be made to differ from start order.
  function installProbe(plan) {
    global.Image = class {
      set src(url) {
        const { width, height, delay = 0 } = plan[url];
        inflight++;
        if (inflight > maxInflight) maxInflight = inflight;
        setTimeout(() => {
          inflight--;
          this.naturalWidth = width;
          this.naturalHeight = height;
          this.onload();
        }, delay);
      }
    };
  }

  it('never runs more than SIZE_PROBE_POOL_SIZE probes at once', async () => {
    const plan = {};
    const urls = new Set();
    for (let i = 0; i < 200; i++) {
      const url = `https://example.com/img${i}.jpg`;
      urls.add(url);
      plan[url] = { width: 300, height: 300, delay: 1 };
    }
    installProbe(plan);

    const results = await filterImagesBySize(urls, new Map());

    expect(results).toHaveLength(200);
    expect(maxInflight).toBeGreaterThan(1);
    expect(maxInflight).toBeLessThanOrEqual(SIZE_PROBE_POOL_SIZE);
  });

  // The pool writes results back by index instead of collecting them as probes
  // settle. Without that, output order would follow completion order — which for
  // a size filter means the popup grid reshuffles by how fast each image loaded.
  it('preserves input order when probes settle out of order', async () => {
    const order = ['a', 'b', 'c', 'd', 'e'].map((n) => `https://example.com/${n}.jpg`);
    const plan = {
      [order[0]]: { width: 300, height: 300, delay: 40 },
      [order[1]]: { width: 100, height: 100, delay: 30 },
      [order[2]]: { width: 300, height: 300, delay: 20 },
      [order[3]]: { width: 300, height: 300, delay: 10 },
      [order[4]]: { width: 100, height: 100, delay: 0 }
    };
    installProbe(plan);

    const results = await filterImagesBySize(new Set(order), new Map());

    // Completion order is e, d, c, b, a; the two undersized ones drop out.
    expect(results).toEqual([order[0], order[2], order[3]]);
  });

  it('drains every pending URL when there are more than the pool can hold at once', async () => {
    const plan = {};
    const urls = new Set();
    for (let i = 0; i < SIZE_PROBE_POOL_SIZE * 3 + 1; i++) {
      const url = `https://example.com/drain${i}.jpg`;
      urls.add(url);
      // Undersized entries are dropped, so a stalled worker would show up as a
      // short result array rather than a hang.
      plan[url] = { width: i % 2 === 0 ? 300 : 100, height: 300, delay: 0 };
    }
    installProbe(plan);

    const results = await filterImagesBySize(urls, new Map());

    expect(results).toHaveLength(Math.ceil(urls.size / 2));
  });

  // A probed URL is by definition absent from document.images, so the caller
  // has no other way to learn its dimensions. addNewUrls reads sizes straight
  // back off this map to build the popup item; without the write-back every
  // network-probed image reaches the grid as 0x0 and loses its size label.
  it('records probe measurements in the provided sizeMap', async () => {
    const big = 'https://example.com/probed-big.jpg';
    const small = 'https://example.com/probed-small.jpg';
    installProbe({
      [big]: { width: 640, height: 480 },
      [small]: { width: 50, height: 50 }
    });

    const sizeMap = new Map();
    const results = await filterImagesBySize(new Set([big, small]), sizeMap);

    expect(results).toEqual([big]);
    expect(sizeMap.get(big)).toEqual({ width: 640, height: 480 });
    // Rejected URLs are still measured — the map is a measurement cache, not
    // an accept list, and addNewUrls only reads it for accepted entries.
    expect(sizeMap.get(small)).toEqual({ width: 50, height: 50 });
  });

  it('leaves the sizeMap untouched for a probe that fails to load', async () => {
    const broken = 'https://example.com/broken.jpg';
    global.Image = class {
      set src(url) {
        setTimeout(() => this.onerror(), 0);
      }
    };

    const sizeMap = new Map();
    const results = await filterImagesBySize(new Set([broken]), sizeMap);

    expect(results).toEqual([]);
    expect(sizeMap.has(broken)).toBe(false);
  });
});
