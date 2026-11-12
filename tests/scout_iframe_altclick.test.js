const fs = require('fs');

const { TextEncoder, TextDecoder } = require("util");
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

describe('Scout: Cross-iframe element targeting and URL resolution', () => {
  let dom;
  let document;
  let getElementsFromPointRecursive;
  let resolveUrl;
  const contentSrc = fs.readFileSync('./src/content.js', 'utf8');
  const { JSDOM } = require('jsdom');

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
      <head>
        <base href="http://example.com/root/">
      </head>
      <body>
        <iframe id="ifr"></iframe>
      </body>
      </html>
    `, { url: 'http://example.com/root/', runScripts: 'dangerously' });

    document = dom.window.document;

    dom.window.TextEncoder = TextEncoder;
    dom.window.TextDecoder = TextDecoder;

    const fnStr = contentSrc.match(/function getElementsFromPointRecursive[\s\S]*?return Array\.from\(elements\);\n  }/)[0];

    // For getting recursive elements
    getElementsFromPointRecursive = dom.window.eval(`
      (function() {
        ` + fnStr + `
        return getElementsFromPointRecursive;
      })()
    `);

    const resolveStr = contentSrc.match(/function resolveUrl[\s\S]*?return null;\n    }\n  }/)[0];
    resolveUrl = dom.window.eval(`
      (function() {
        const document = window.document;
        ` + resolveStr + `
        return resolveUrl;
      })()
    `);
  });

  test('Cross-origin frames are skipped', () => {
    const iframe = document.createElement('iframe');
    // Don't set contentDocument
    Object.defineProperty(iframe, 'contentDocument', { get: () => { throw new Error('cross-origin'); } });
    iframe.getBoundingClientRect = () => ({ left: 50, top: 50, width: 200, height: 200 });
    document.body.appendChild(iframe);

    document.elementsFromPoint = jest.fn().mockReturnValue([iframe]);

    expect(() => {
        getElementsFromPointRecursive(document, 100, 100);
    }).not.toThrow();
  });

  test('Recursion depth is capped', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    const iframeDoc = dom.window.document.implementation.createHTMLDocument();
    Object.defineProperty(iframe, 'contentDocument', { get: () => iframeDoc });
    iframe.getBoundingClientRect = () => ({ left: 50, top: 50, width: 200, height: 200 });

    document.elementsFromPoint = jest.fn().mockReturnValue([iframe]);
    iframeDoc.elementsFromPoint = jest.fn().mockReturnValue([iframe]); // infinite recursion

    const elements = getElementsFromPointRecursive(document, 100, 100);
    expect(iframeDoc.elementsFromPoint).toHaveBeenCalledTimes(5);
  });

  test('resolveUrl fails closed (returns null) if parsed URL protocol is not http/https/blob/data', () => {
    const url = resolveUrl('ftp://example.com/test.jpg');
    expect(url).toBeNull();
  });
});