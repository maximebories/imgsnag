const { extractBgImageUrls } = require('../src/content.js');

describe('extractBgImageUrls', () => {
  it('should be a function', () => {
    expect(typeof extractBgImageUrls).toBe('function');
  });

  it('should extract a single URL without quotes', () => {
    const bgValue = 'url(image.jpg)';
    expect(extractBgImageUrls(bgValue)).toEqual(['image.jpg']);
  });

  it('should extract a single URL with single quotes', () => {
    const bgValue = "url('image.jpg')";
    expect(extractBgImageUrls(bgValue)).toEqual(['image.jpg']);
  });

  it('should extract a single URL with double quotes', () => {
    const bgValue = 'url("image.jpg")';
    expect(extractBgImageUrls(bgValue)).toEqual(['image.jpg']);
  });

  it('should extract multiple URLs', () => {
    const bgValue = 'url("image1.jpg"), url(\'image2.png\'), url(image3.gif)';
    expect(extractBgImageUrls(bgValue)).toEqual(['image1.jpg', 'image2.png', 'image3.gif']);
  });

  it('should return an empty array if no URLs are found', () => {
    const bgValue = 'none';
    expect(extractBgImageUrls(bgValue)).toEqual([]);
  });

  it('should return an empty array for an empty string', () => {
    const bgValue = '';
    expect(extractBgImageUrls(bgValue)).toEqual([]);
  });

  it('should handle complex background properties', () => {
    const bgValue = 'linear-gradient(to right, red, blue), url("bg.jpg") no-repeat center';
    expect(extractBgImageUrls(bgValue)).toEqual(['bg.jpg']);
  });

  it('should extract URLs from image-set() strings', () => {
    const bgValue = 'image-set("img1.png" 1x, url("img2.png") 2x)';
    expect(extractBgImageUrls(bgValue)).toEqual(['img2.png', 'img1.png']);
  });

  it('should extract URLs from -webkit-image-set() strings', () => {
    const bgValue = '-webkit-image-set("img1.png" 1x, "img2.png" 2x)';
    expect(extractBgImageUrls(bgValue)).toEqual(['img1.png', 'img2.png']);
  });

  it('should extract URLs with extraneous spaces inside the parentheses (current regex behavior)', () => {
    const bgValue = "url(  'image.jpg'  )";
    expect(extractBgImageUrls(bgValue)).toEqual(["  'image.jpg'  "]);
  });

  it('should extract URLs with extraneous spaces and no quotes', () => {
    const bgValue = "url(  image.jpg  )";
    expect(extractBgImageUrls(bgValue)).toEqual(["  image.jpg  "]);
  });

  it('should return empty array for random text', () => {
    const bgValue = "some random text without url function";
    expect(extractBgImageUrls(bgValue)).toEqual([]);
  });
});

describe('parseSrcset', () => {
  const { parseSrcset } = require('../src/content.js');

  it('should return empty array for empty, null or undefined input', () => {
    expect(parseSrcset(null)).toEqual([]);
    expect(parseSrcset(undefined)).toEqual([]);
    expect(parseSrcset('')).toEqual([]);
  });

  it('should parse a basic single srcset entry without descriptors', () => {
    expect(parseSrcset('image.jpg')).toEqual(['image.jpg']);
  });

  it('should parse a single srcset entry with descriptors', () => {
    expect(parseSrcset('image.jpg 1x')).toEqual(['image.jpg']);
    expect(parseSrcset('image2.png 100w')).toEqual(['image2.png']);
  });

  it('should parse multiple srcset entries', () => {
    expect(parseSrcset('img1.jpg 1x, img2.jpg 2x')).toEqual(['img1.jpg', 'img2.jpg']);
  });

  it('should handle excessive whitespace correctly', () => {
    expect(parseSrcset('  img1.jpg   1x  ,   img2.jpg   2x  ')).toEqual(['img1.jpg', 'img2.jpg']);
  });

  it('should drop trailing commas or empty entries', () => {
    expect(parseSrcset('img1.jpg 1x, , img2.jpg 2x,')).toEqual(['img1.jpg', 'img2.jpg']);
  });
});

describe('handleMeta', () => {
  const { handleMeta } = require('../src/content.js');

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  it('captures meta[property="og:image"]', () => {
    const set = new Set();
    handleMeta(el('meta', { property: 'og:image', content: 'https://example.com/og.jpg' }), set);
    expect([...set]).toEqual(['https://example.com/og.jpg']);
  });

  it('captures meta[name="twitter:image"]', () => {
    const set = new Set();
    handleMeta(el('meta', { name: 'twitter:image', content: 'https://example.com/twitter.jpg' }), set);
    expect([...set]).toEqual(['https://example.com/twitter.jpg']);
  });

  it('captures link[rel="preload"][as="image"]', () => {
    const set = new Set();
    handleMeta(el('link', { rel: 'preload', as: 'image', href: 'https://example.com/preload.png' }), set);
    expect([...set]).toEqual(['https://example.com/preload.png']);
  });

  it('ignores other meta and link tags', () => {
    const set = new Set();
    handleMeta(el('meta', { name: 'description', content: 'hello' }), set);
    handleMeta(el('link', { rel: 'stylesheet', href: 'style.css' }), set);
    handleMeta(el('div', { class: 'something' }), set);
    expect(set.size).toBe(0);
  });
});

describe('pickBestFromSrcset', () => {
  const { pickBestFromSrcset } = require('../src/content.js');

  it('picks the widest w descriptor', () => {
    expect(pickBestFromSrcset('a.jpg 400w, b.jpg 1200w, c.jpg 800w')).toBe('b.jpg');
  });

  it('picks the highest density x descriptor', () => {
    expect(pickBestFromSrcset('a.jpg 1x, b.jpg 3x, c.jpg 2x')).toBe('b.jpg');
  });

  it('treats a missing descriptor as 1x', () => {
    expect(pickBestFromSrcset('a.jpg, b.jpg 2x')).toBe('b.jpg');
    expect(pickBestFromSrcset('only.jpg')).toBe('only.jpg');
  });

  it('returns null for empty or missing input', () => {
    expect(pickBestFromSrcset('')).toBeNull();
    expect(pickBestFromSrcset(null)).toBeNull();
  });

  it('survives malformed entries', () => {
    expect(pickBestFromSrcset(' , a.jpg 800w, , b.jpg oops')).toBe('a.jpg');
  });
});

describe('handleSource', () => {
  const { handleSource } = require('../src/content.js');

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  // Picture sources are owned by handlePicture (one URL per <picture>) so the
  // grid never shows the same image once per format/breakpoint variant.
  it('leaves picture sources to handlePicture', () => {
    const { handlePicture } = require('../src/content.js');
    const imageSet = new Set();
    const videoSet = new Set();

    const picture = el('picture');
    const source = el('source', { 'data-src': 'https://example.com/lazy-pic.jpg' });
    picture.appendChild(source);
    document.body.appendChild(picture);

    handleSource(source, imageSet, videoSet);
    expect(imageSet.size).toBe(0);
    expect(videoSet.size).toBe(0);

    handlePicture(picture, imageSet);
    expect([...imageSet]).toEqual(['https://example.com/lazy-pic.jpg']);

    document.body.removeChild(picture);
  });

  it('extracts video src in video source elements', () => {
    const imageSet = new Set();
    const videoSet = new Set();

    const video = el('video');
    const source = el('source', { src: 'https://example.com/video.mp4' });
    video.appendChild(source);
    document.body.appendChild(video);

    handleSource(source, imageSet, videoSet);

    expect(imageSet.size).toBe(0);
    expect([...videoSet]).toEqual(['https://example.com/video.mp4']);

    document.body.removeChild(video);
  });
});

describe('handlePicture', () => {
  const { handlePicture } = require('../src/content.js');

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  it('selects img.currentSrc over sources when available', () => {
    const imageSet = new Set();
    const picture = el('picture');
    const source = el('source', { srcset: 'https://example.com/source.jpg' });
    const img = el('img');
    // Mock currentSrc as JSDOM does not dynamically resolve it
    Object.defineProperty(img, 'currentSrc', {
      value: 'https://example.com/current.jpg',
      writable: true,
      configurable: true
    });

    picture.appendChild(source);
    picture.appendChild(img);

    handlePicture(picture, imageSet);
    expect([...imageSet]).toEqual(['https://example.com/current.jpg']);
  });

  it('falls back to first usable source when img.currentSrc is empty', () => {
    const imageSet = new Set();
    const picture = el('picture');
    const source1 = el('source', { 'data-src': 'https://example.com/fallback.jpg' });
    const img = el('img');

    Object.defineProperty(img, 'currentSrc', {
      value: '',
      writable: true,
      configurable: true
    });

    picture.appendChild(source1);
    picture.appendChild(img);

    handlePicture(picture, imageSet);
    expect([...imageSet]).toEqual(['https://example.com/fallback.jpg']);
  });
});
