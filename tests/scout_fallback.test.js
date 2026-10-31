const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

const { getTargetUrlsForElement } = require('../src/content.js');
const { JSDOM } = require('jsdom');
const fs = require('fs');
const contentSrc = fs.readFileSync('./src/content.js', 'utf8');

describe('Scout Fallback tests', () => {
  let dom;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'https://example.com/' });
    global.document = dom.window.document;
    global.window = dom.window;
    global.Node = dom.window.Node;
    global.NodeFilter = dom.window.NodeFilter;
    global.Image = dom.window.Image;
    global.XMLSerializer = dom.window.XMLSerializer;
    global.DOMParser = dom.window.DOMParser;
    global.browser = {
      runtime: {
        sendMessage: jest.fn().mockResolvedValue({}),
        onConnect: { addListener: jest.fn() }
      },
      storage: {
        onChanged: { addListener: jest.fn() },
        sync: { get: jest.fn().mockResolvedValue({ disableDrag: false }) }
      }
    };
    global.performance = { now: () => 1000 };
    global.requestIdleCallback = jest.fn();
    global.MutationObserver = class { observe() {} };
    global.PerformanceObserver = class { observe() {} };
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
    delete global.Node;
    delete global.NodeFilter;
    delete global.Image;
    delete global.XMLSerializer;
    delete global.DOMParser;
    delete global.browser;
    delete global.performance;
    delete global.requestIdleCallback;
    delete global.MutationObserver;
    delete global.PerformanceObserver;
  });

  test('getTargetUrlsForElement uses src when currentSrc is a data URL', () => {
    const img = document.createElement('img');
    img.src = 'https://example.com/fallback.jpg';
    Object.defineProperty(img, 'currentSrc', { get: () => 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7' });

    const urls = getTargetUrlsForElement(img);
    expect(urls).toEqual(['https://example.com/fallback.jpg']);
  });

  test('collectImages tracks src when picture source is a data URL', () => {
      dom.window.performance = { now: () => 1000 };
      dom = new JSDOM(`
        <picture>
          <source srcset="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7">
          <img src="http://example.com/real.jpg">
        </picture>
      `, { url: 'http://example.com/', runScripts: "outside-only" });

      dom.window.browser = {
        runtime: {
          sendMessage: jest.fn().mockResolvedValue({}),
          onConnect: { addListener: jest.fn() }
        },
        storage: {
          onChanged: { addListener: jest.fn() },
          sync: { get: jest.fn().mockResolvedValue({ disableDrag: false }) }
        }
      };

      const contentSrcFixed = 'window.module = { exports: {} };\n' + contentSrc + '\nwindow.imgsnagExports = window.module.exports;';
      dom.window.performance = { now: () => 1000 };
      dom.window.eval(contentSrcFixed);

      const img = dom.window.document.querySelector('img');
      Object.defineProperty(img, 'currentSrc', { get() { return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; } });

      const res = dom.window.imgsnagExports.collectMediaUrls();
      expect(Array.from(res.imageUrls)).toContain('http://example.com/real.jpg');
  });
});