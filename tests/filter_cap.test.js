const fs = require('fs');
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const jsdom = require("jsdom");
const { JSDOM } = jsdom;

describe('Network probe fan-out cap', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: "https://example.com/" });
    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.NodeFilter = dom.window.NodeFilter;
    global.Image = dom.window.Image;
    global.URL = dom.window.URL;
    global.CSS = { escape: (str) => str };
    global.browser = {
      runtime: { onConnect: { addListener: () => {} } },
      storage: { sync: { get: () => Promise.resolve({ disableDrag: false }) }, onChanged: { addListener: () => {} } }
    };
    global.location = dom.window.location;
    global.getComputedStyle = dom.window.getComputedStyle;
    global.XMLSerializer = dom.window.XMLSerializer;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('limits concurrent Image loads to 12', async () => {
    let inflight = 0;
    let maxInflight = 0;

    class MockImage {
      constructor() {
        this.naturalWidth = 300;
        this.naturalHeight = 300;
      }
      set src(url) {
        inflight++;
        if (inflight > maxInflight) maxInflight = inflight;

        setTimeout(() => {
          inflight--;
          if (this.onload) this.onload();
        }, 10);
      }
    }

    global.Image = MockImage;
    dom.window.Image = MockImage;

    const code = fs.readFileSync('./src/content.js', 'utf8');
    const testCode = code.replace('let popupPort = null;', 'let popupPort = true;');

    const injectedCode = testCode.replace('module.exports = {', 'module.exports = { filterImagesBySize, ');
    const m = { exports: {} };
    const func = new Function('module', 'browser', injectedCode);
    func(m, global.browser);

    const { filterImagesBySize } = m.exports;

    const urls = new Set();
    for (let i = 0; i < 200; i++) urls.add('http://example.com/test' + i + '.jpg');

    const sizeMap = new Map();

    const results = await filterImagesBySize(urls, sizeMap);

    expect(results.length).toBe(200);
    expect(maxInflight).toBeLessThanOrEqual(12);
    expect(maxInflight).toBeGreaterThan(0);
  });
});
