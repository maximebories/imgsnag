/**
 * @jest-environment jsdom
 */

describe('Content script ReDoS fallback (TreeWalker)', () => {
  let collectMediaUrls;

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

    // Create a mock DOM environment
    document.body.innerHTML = '';

    const content = require('../src/content.js');
    collectMediaUrls = content.collectMediaUrls;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('securely extracts URLs using TreeWalker without regex striping', () => {
    // Add text node with a valid image URL
    const textNode = document.createTextNode('Check this out: https://example.com/hidden.jpg');
    document.body.appendChild(textNode);

    // Add element with a data attribute containing a valid image URL
    const div = document.createElement('div');
    div.setAttribute('data-custom', '{"image": "https://example.com/data.png"}');
    document.body.appendChild(div);

    // Add JSON-LD script block containing an image URL
    const script = document.createElement('script');
    script.setAttribute('type', 'application/ld+json');
    script.textContent = '{"image": "https://example.com/schema.gif"}';
    document.body.appendChild(script);

    // Add a JSON-LD script block with an escaped image URL
    const escapedScript = document.createElement('script');
    escapedScript.setAttribute('type', 'application/ld+json');
    escapedScript.textContent = '{"image": "https:\\/\\/example.com\\/escaped.gif"}';
    document.body.appendChild(escapedScript);

    // Add a normal script block containing an image URL (should be rejected)
    const badScript = document.createElement('script');
    badScript.textContent = 'const img = "https://example.com/bad.png";';
    document.body.appendChild(badScript);

    // Add a style block containing an image URL (should be rejected)
    const style = document.createElement('style');
    style.textContent = '.bg { background-image: url("https://example.com/style.png"); }';
    document.body.appendChild(style);

    const { imageUrls } = collectMediaUrls();

    expect(imageUrls.has('https://example.com/hidden.jpg')).toBe(true);
    expect(imageUrls.has('https://example.com/data.png')).toBe(true);
    expect(imageUrls.has('https://example.com/schema.gif')).toBe(true);
    expect(imageUrls.has('https://example.com/escaped.gif')).toBe(true);
    expect(imageUrls.has('https://example.com/bad.png')).toBe(false);
    expect(imageUrls.has('https://example.com/style.png')).toBe(false);
  });
});
