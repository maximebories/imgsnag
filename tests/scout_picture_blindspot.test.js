const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const { JSDOM } = require('jsdom');
const fs = require('fs');
const contentSrc = fs.readFileSync('./src/content.js', 'utf8');

describe('Scout Picture Blindspot test', () => {
  let dom;
  afterEach(() => {
    if (dom) dom.window.close();
  });

  test('collectMediaUrls does not short-circuit picture sources when currentSrc is data URI', () => {
      dom = new JSDOM(`
        <!DOCTYPE html>
        <html>
        <head></head>
        <body>
          <picture>
            <source data-srcset="https://example.com/highres.jpg 1000w">
            <img src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=">
          </picture>
        </body>
        </html>
      `, { url: 'https://example.com/', runScripts: "outside-only" });

      dom.window.browser = {
        runtime: {
          sendMessage: () => Promise.resolve({}),
          onConnect: { addListener: () => {} }
        },
        storage: {
          onChanged: { addListener: () => {} },
          sync: { get: () => Promise.resolve({ disableDrag: false }) }
        }
      };

      const contentSrcFixed = 'window.module = { exports: {} };\n' + contentSrc + '\nwindow.imgsnagExports = window.module.exports;';
      dom.window.eval(contentSrcFixed);

      const img = dom.window.document.querySelector('img');
      Object.defineProperty(img, 'currentSrc', {
          get() { return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; }
      });

      const res = dom.window.imgsnagExports.collectMediaUrls();
      expect(Array.from(res.imageUrls)).toContain('https://example.com/highres.jpg');
  });

  test('handlePicture does not short-circuit picture sources when currentSrc is data URI', () => {
      dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>', { url: 'https://example.com/', runScripts: "outside-only" });

      dom.window.browser = {
        runtime: {
          sendMessage: () => Promise.resolve({}),
          onConnect: { addListener: () => {} }
        },
        storage: {
          onChanged: { addListener: () => {} },
          sync: { get: () => Promise.resolve({ disableDrag: false }) }
        }
      };

      const contentSrcFixed = 'window.module = { exports: {} };\n' + contentSrc + '\nwindow.imgsnagExports = window.module.exports;';
      dom.window.eval(contentSrcFixed);

      const pic = dom.window.document.createElement('picture');
      const source = dom.window.document.createElement('source');
      source.setAttribute('data-srcset', 'https://example.com/dynamic-highres.jpg 1000w');
      pic.appendChild(source);

      const img = dom.window.document.createElement('img');
      Object.defineProperty(img, 'currentSrc', {
          get() { return 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='; }
      });
      pic.appendChild(img);

      const imageSet = new Set();
      dom.window.imgsnagExports.handlePicture(pic, imageSet);
      expect(Array.from(imageSet)).toContain('https://example.com/dynamic-highres.jpg');
  });
});
