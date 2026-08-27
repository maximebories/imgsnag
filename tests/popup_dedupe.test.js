/**
 * @jest-environment jsdom
 */

// popup.js reads the DOM and i18n at require time — provide both
document.body.innerHTML = `
  <div id="loading" class="visible"><span id="loading-text"></span></div>
  <div id="empty"><span id="empty-text"></span><span id="empty-hint"></span></div>
  <div id="error"><span id="error-text"></span></div>
  <ul id="grid"></ul>
  <div id="video-header"><span id="video-header-text"></span></div>
  <ul id="video-grid"></ul>
  <div id="bar"><span id="counter"></span>
    <div class="actions"><button id="btn-selected"></button><button id="btn-all"></button></div>
  </div>`;

global.browser = {
  i18n: { getUILanguage: () => 'en', getMessage: (k) => k },
  runtime: { sendMessage: jest.fn().mockResolvedValue() },
  tabs: { query: jest.fn().mockResolvedValue([]), connect: jest.fn() }
};

const { hammingDistance, pickDuplicateUrls } = require('../src/popup.js');

const h = (hi, lo) => ({ hi, lo });

describe('hammingDistance', () => {
  it('is 0 for identical hashes', () => {
    expect(hammingDistance(h(0x12345678, 0x9abcdef0), h(0x12345678, 0x9abcdef0))).toBe(0);
  });

  it('counts differing bits across both halves', () => {
    expect(hammingDistance(h(0b1011, 0), h(0b0011, 0))).toBe(1);
    expect(hammingDistance(h(0xffffffff | 0, 0xffffffff | 0), h(0, 0))).toBe(64);
  });
});

describe('pickDuplicateUrls', () => {
  const entry = (url, hash, area, aspect = 1) => ({ url, hash, area, aspect });

  it('hides all but the largest of a near-identical cluster', () => {
    const hidden = pickDuplicateUrls([
      entry('small.jpg', h(0xabc, 0xdef), 100 * 100),
      entry('large.jpg', h(0xabc, 0xdee), 1200 * 1200), // 1 bit away
      entry('medium.jpg', h(0xabc, 0xdcf), 600 * 600)   // 2 bits away
    ]);
    expect(hidden.sort()).toEqual(['medium.jpg', 'small.jpg']);
  });

  it('keeps visually distinct images', () => {
    expect(pickDuplicateUrls([
      entry('a.jpg', h(0, 0), 500 * 500),
      entry('b.jpg', h(0xffffffff | 0, 0xffffffff | 0), 500 * 500)
    ])).toEqual([]);
  });

  it('never compares across different aspect ratios', () => {
    expect(pickDuplicateUrls([
      entry('wide.jpg', h(1, 1), 800 * 400, 2),
      entry('square.jpg', h(1, 1), 400 * 400, 1)
    ])).toEqual([]);
  });

  it('skips entries whose hash failed', () => {
    expect(pickDuplicateUrls([
      entry('ok.jpg', h(1, 1), 500 * 500),
      entry('failed.jpg', null, 900 * 900)
    ])).toEqual([]);
  });

  it('hides nothing for singletons', () => {
    expect(pickDuplicateUrls([entry('only.jpg', h(5, 5), 300 * 300)])).toEqual([]);
  });
});
