const { getTargetUrlsForElement } = require('../src/content.js');

describe('Alt-Click / getTargetUrlsForElement blind spot', () => {
  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('misses lazy-loaded data-srcset', () => {
    const img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    Object.defineProperty(img, 'currentSrc', { value: img.src });
    img.setAttribute('data-srcset', 'https://example.com/highres.jpg 2x, https://example.com/med.jpg 1x');
    document.body.appendChild(img);

    const urls = getTargetUrlsForElement(img);
    expect(urls).toContain('https://example.com/highres.jpg');
  });

  it('misses picture sources', () => {
    const pic = document.createElement('picture');
    const source = document.createElement('source');
    source.setAttribute('data-srcset', 'https://example.com/pic-high.jpg');
    const img = document.createElement('img');
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    Object.defineProperty(img, 'currentSrc', { value: img.src });
    pic.appendChild(source);
    pic.appendChild(img);
    document.body.appendChild(pic);

    const urls = getTargetUrlsForElement(img);
    expect(urls).toContain('https://example.com/pic-high.jpg');
  });

  it('misses lazy-loaded video sources', () => {
    const video = document.createElement('video');
    const source = document.createElement('source');
    source.setAttribute('data-src', 'https://example.com/video.mp4');
    video.appendChild(source);
    document.body.appendChild(video);

    const urls = getTargetUrlsForElement(video);
    expect(urls).toContain('https://example.com/video.mp4');
  });

  it('extracts urls from OBJECT, EMBED, IFRAME and inline SVG image elements', () => {
    const object = el('object', { data: 'https://example.com/object.jpg' });
    expect(getTargetUrlsForElement(object)).toContain('https://example.com/object.jpg');

    const embed = el('embed', { src: 'https://example.com/embed.jpg' });
    expect(getTargetUrlsForElement(embed)).toContain('https://example.com/embed.jpg');

    const iframe = el('iframe', { src: 'https://example.com/iframe.jpg' });
    expect(getTargetUrlsForElement(iframe)).toContain('https://example.com/iframe.jpg');

    const svgImage = document.createElementNS('http://www.w3.org/2000/svg', 'image');
    svgImage.setAttribute('href', 'https://example.com/svg.jpg');
    expect(getTargetUrlsForElement(svgImage)).toContain('https://example.com/svg.jpg');
  });

  it('extracts urls from data-bg attributes', () => {
    const div = el('div', { 'data-bg': 'https://example.com/data-bg.jpg' });
    expect(getTargetUrlsForElement(div)).toContain('https://example.com/data-bg.jpg');
  });
});
