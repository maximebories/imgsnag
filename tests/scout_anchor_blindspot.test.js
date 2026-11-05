const { collectMediaUrls, TAG_SET } = require('../src/content.js');

describe('Scout: Anchor and Area blindspot', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Mock resolveUrl dependency (document.baseURI)
    if (!document.head.querySelector('base')) {
      const base = document.createElement('base');
      base.href = 'https://example.com/';
      document.head.appendChild(base);
    }
  });

  afterEach(() => {
    const base = document.head.querySelector('base');
    if (base) base.remove();
  });

  test('extracts relative image URLs from a[href] and area[href]', () => {
    document.body.innerHTML = `
      <a href="/images/gallery/highres.jpg" class="lightbox">
        <img src="thumb.jpg">
      </a>
      <map name="image-map">
        <area shape="rect" coords="0,0,10,10" href="/images/gallery/area.png">
      </map>
      <a href="https://example.com/another.jpg">Download</a>
      <a href="/about-us.html">Not an image</a>
    `;

    const { imageUrls } = collectMediaUrls();
    const urls = Array.from(imageUrls);

    expect(urls).toContain('https://example.com/images/gallery/highres.jpg');
    expect(urls).toContain('https://example.com/images/gallery/area.png');
    expect(urls).toContain('https://example.com/another.jpg');
    expect(urls).toContain('https://example.com/thumb.jpg');
    expect(urls).not.toContain('https://example.com/about-us.html');
  });

  test('TAG_SET includes AREA', () => {
    expect(TAG_SET.has('AREA')).toBe(true);
  });
});
