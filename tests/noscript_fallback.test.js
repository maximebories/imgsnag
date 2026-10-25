/**
 * @jest-environment jsdom
 */

describe('collectNoscriptImages', () => {
  let collectNoscriptImages;

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
    const content = require('../src/content.js');
    collectNoscriptImages = content.collectNoscriptImages;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('extracts images from noscript tags contextually using DOMParser', () => {
    const noscript = document.createElement('noscript');
    noscript.textContent = '<img src="https://example.com/noscript.jpg">';
    document.body.appendChild(noscript);

    const { imageUrls, videoUrls } = collectNoscriptImages();
    expect(imageUrls.has('https://example.com/noscript.jpg')).toBe(true);
    expect(videoUrls.size).toBe(0);
  });

  it('skips noscript tags that do not pass the fast-path regex check', () => {
    const noscript = document.createElement('noscript');
    noscript.textContent = '<div>Just some text, no image tags here.</div>';
    document.body.appendChild(noscript);

    // If it fails to skip, DOMParser might be called (which is slow)
    // But behaviorally, we expect 0 URLs
    const { imageUrls } = collectNoscriptImages();
    expect(imageUrls.size).toBe(0);
  });

  it('honors the page base href when extracting inert noscript attributes', () => {
    const base = document.createElement('base');
    base.href = 'https://cdn.example.com/assets/';
    document.head.appendChild(base);

    try {
      const noscript = document.createElement('noscript');
      noscript.textContent = '<img src="relative-fallback.jpg">';
      document.body.appendChild(noscript);

      const { imageUrls } = collectNoscriptImages();
      // Even though DOMParser creates an about:blank document, resolveUrl
      // correctly uses the live document.baseURI
      expect(imageUrls.has('https://cdn.example.com/assets/relative-fallback.jpg')).toBe(true);
    } finally {
      base.remove();
    }
  });
});
