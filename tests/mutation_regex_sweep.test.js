/**
 * @jest-environment jsdom
 */

// Pins the shared per-node regex sweep that the MutationObserver reuses to
// catch URLs in dynamically added text nodes and attributes (Scout, PR #216).
describe('extractRegexUrls — shared text/attribute sweep', () => {
  let extractRegexUrls;

  beforeEach(() => {
    jest.resetModules();

    global.browser = {
      runtime: {
        sendMessage: jest.fn().mockResolvedValue(),
        onConnect: { addListener: jest.fn() }
      },
      storage: {
        sync: { get: jest.fn().mockResolvedValue({ disableDrag: false }) },
        onChanged: { addListener: jest.fn() }
      }
    };

    document.body.innerHTML = '';
    extractRegexUrls = require('../src/content.js').extractRegexUrls;
  });

  const sweep = (node) => {
    const found = [];
    extractRegexUrls(node, (url) => found.push(url));
    return found;
  };

  it('extracts image URLs from a text node', () => {
    const node = document.createTextNode('{"image": "https://example.com/late.jpg"}');
    expect(sweep(node)).toEqual(['https://example.com/late.jpg']);
  });

  it('skips text nodes whose parent is a style element', () => {
    const style = document.createElement('style');
    const node = document.createTextNode('.bg { background-image: url("https://example.com/late.jpg"); }');
    style.appendChild(node);
    expect(sweep(node)).toEqual([]);
  });

  it('skips text nodes whose parent is a script element without JSON type', () => {
    const script = document.createElement('script');
    const node = document.createTextNode('var img = "https://example.com/late.jpg";');
    script.appendChild(node);
    expect(sweep(node)).toEqual([]);
  });

  it('extracts image URLs from text nodes whose parent is a JSON script element', () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/json');
    const node = document.createTextNode('{"image": "https://example.com/late.jpg"}');
    script.appendChild(node);
    expect(sweep(node)).toEqual(['https://example.com/late.jpg']);
  });

  it('extracts image URLs from text nodes whose parent is a JSON-LD script element', () => {
    const script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    const node = document.createTextNode('{"image": "https://example.com/late.jpg"}');
    script.appendChild(node);
    expect(sweep(node)).toEqual(['https://example.com/late.jpg']);
  });

  it('unescapes backslash-escaped URLs in JSON text', () => {
    const node = document.createTextNode('{"image": "https:\\/\\/example.com\\/escaped.gif"}');
    expect(sweep(node)).toEqual(['https://example.com/escaped.gif']);
  });

  it('extracts image URLs from element attributes', () => {
    const el = document.createElement('div');
    el.setAttribute('data-payload', '{"image": "https://example.com/attr.png"}');
    expect(sweep(el)).toEqual(['https://example.com/attr.png']);
  });

  it('skips srcset-family attributes, which the structural scan already handled', () => {
    const el = document.createElement('img');
    el.setAttribute('srcset', 'https://example.com/small.jpg 1x, https://example.com/big.jpg 2x');
    el.setAttribute('data-srcset', 'https://example.com/other.jpg 1x');
    expect(sweep(el)).toEqual([]);
  });

  it('returns nothing for elements with no attributes', () => {
    expect(sweep(document.createElement('div'))).toEqual([]);
  });

  it('finds every match in one value rather than stopping at the first', () => {
    const node = document.createTextNode(
      '["https://example.com/a.jpg","https://example.com/b.png"]'
    );
    expect(sweep(node)).toEqual([
      'https://example.com/a.jpg',
      'https://example.com/b.png'
    ]);
  });

  it('is repeatable — a stale global regex lastIndex does not drop matches', () => {
    const node = document.createTextNode('{"image": "https://example.com/repeat.jpg"}');
    expect(sweep(node)).toEqual(['https://example.com/repeat.jpg']);
    expect(sweep(node)).toEqual(['https://example.com/repeat.jpg']);
    expect(sweep(node)).toEqual(['https://example.com/repeat.jpg']);
  });
});

describe('MutationObserver root node filtering (TreeWalker)', () => {
  let observerCallback;
  let originalMutationObserver;

  beforeEach(() => {
    jest.resetModules();
    global.browser = {
      runtime: { sendMessage: jest.fn().mockResolvedValue(), onConnect: { addListener: jest.fn() } },
      storage: { sync: { get: jest.fn().mockResolvedValue({ disableDrag: false }) }, onChanged: { addListener: jest.fn() } }
    };
    document.body.innerHTML = '';

    originalMutationObserver = global.MutationObserver;
    global.MutationObserver = class MockObserver {
      constructor(cb) {
        observerCallback = cb;
      }
      observe() {}
      disconnect() {}
    };

    require('../src/content.js');
  });

  afterEach(() => {
    global.MutationObserver = originalMutationObserver;
  });

  it('does not extract URLs from dynamically added <script> and <style> tags', () => {
    // 1. Add a non-JSON script with a URL
    const script = document.createElement('script');
    script.textContent = 'const img = "https://example.com/bad-script.png";';

    // 2. Add a style with a URL
    const style = document.createElement('style');
    style.textContent = '.bg { background-image: url("https://example.com/bad-style.png"); }';

    // 3. Add an application/json script with a URL (should be extracted)
    const jsonScript = document.createElement('script');
    jsonScript.setAttribute('type', 'application/json');
    jsonScript.textContent = '{"image": "https://example.com/good-json.png"}';

    const mutations = [
      { addedNodes: [script] },
      { addedNodes: [style] },
      { addedNodes: [jsonScript] }
    ];

    const content = require('../src/content.js');
    const extractRegexUrls = content.extractRegexUrls;
    const REGEX_SWEEP_FILTER = content.REGEX_SWEEP_FILTER;

    const imageUrls = new Set();
    const trackSweptImage = (url) => {
      imageUrls.add(url);
    };

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        let shouldSweep = false;
        if (node.nodeType === Node.TEXT_NODE) {
          if (node.parentElement) {
            const pTag = node.parentElement.tagName;
            if (pTag === 'STYLE') {
              shouldSweep = false;
            } else if (pTag === 'SCRIPT') {
              const type = node.parentElement.getAttribute('type');
              shouldSweep = (type === 'application/ld+json' || type === 'application/json');
            } else {
              shouldSweep = true;
            }
          } else {
            shouldSweep = true;
          }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          shouldSweep = REGEX_SWEEP_FILTER.acceptNode(node) !== NodeFilter.FILTER_REJECT;
        }

        if (shouldSweep) {
          extractRegexUrls(node, trackSweptImage);
        }

        if (node.nodeType === Node.ELEMENT_NODE && shouldSweep) {
          const walker = document.createTreeWalker(
            node,
            NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
            REGEX_SWEEP_FILTER
          );

          let el;
          while ((el = walker.nextNode())) {
            extractRegexUrls(el, trackSweptImage);
          }
        }
      }
    }

    const urls = Array.from(imageUrls);
    expect(urls).not.toContain('https://example.com/bad-script.png');
    expect(urls).not.toContain('https://example.com/bad-style.png');
    expect(urls).toContain('https://example.com/good-json.png');
  });
});
