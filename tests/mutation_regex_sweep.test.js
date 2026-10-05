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
