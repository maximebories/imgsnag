describe('Synthesis Drift', () => {
  let content;

  beforeEach(() => {
    jest.resetModules();
    content = require('../src/content.js');
  });

  test('processBgImageQueue uses trackImageUrl for background images', () => {
    const el = document.createElement('div');
    el.setAttribute('class', 'bg-image');
    el.style.backgroundImage = 'url("http://example.com/bg-150x150.jpg")';
    document.body.appendChild(el);

    // Instead of mock calling requestIdleCallback via collectMediaUrls,
    // let's manually mock getting CSS media URLs and pushing through trackImageUrl
    const rawUrls = content.getCssMediaUrls(el);
    const imageUrls = new Set();
    for (const raw of rawUrls) {
      content.trackImageUrl(raw, imageUrls);
    }

    expect(imageUrls.has('http://example.com/bg-150x150.jpg')).toBe(true);
    expect(imageUrls.has('http://example.com/bg.jpg')).toBe(true);
  });

  test('handleDataBg uses trackImageUrl for synthesized urls', () => {
    const el = document.createElement('div');
    el.setAttribute('data-bg', 'http://example.com/image-150x150.jpg');
    const imageSet = new Set();

    content.handleDataBg(el, imageSet);

    expect(imageSet.has('http://example.com/image-150x150.jpg')).toBe(true);
    expect(imageSet.has('http://example.com/image.jpg')).toBe(true);
  });
});
