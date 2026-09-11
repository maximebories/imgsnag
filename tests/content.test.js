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
    const bgValue = 'image-set(url("img1.png") 1x, "img2.png" 2x)';
    expect(extractBgImageUrls(bgValue)).toEqual(['img1.png', 'img2.png']);
  });

  it('should extract URLs from -webkit-image-set() strings', () => {
    const bgValue = '-webkit-image-set(url("img1.png") 1x, "img2.png" 2x, url("img3.png") 3x, "img4.png" 4x)';
    expect(extractBgImageUrls(bgValue)).toEqual(['img1.png', 'img3.png', 'img2.png', 'img4.png']);
  });

  it('should not mistake image-set() type() MIME strings for URLs', () => {
    const bgValue = 'image-set("a.avif" type("image/avif"), "b.jpg" type("image/jpeg"))';
    expect(extractBgImageUrls(bgValue)).toEqual(['a.avif', 'b.jpg']);
  });

  it('should preserve the bare-string variant when it precedes url()', () => {
    const bgValue = 'image-set("img1.png" 1x, url("img2.png") 2x)';
    expect(extractBgImageUrls(bgValue)).toEqual(['img2.png', 'img1.png']);
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

  it('captures the best imagesrcset candidate and skips the href fallback', () => {
    const set = new Set();
    handleMeta(el('link', {
      rel: 'preload',
      as: 'image',
      imagesrcset: 'https://example.com/small.jpg 400w, https://example.com/large.jpg 800w',
      href: 'https://example.com/fallback.jpg'
    }), set);
    expect([...set]).toEqual(['https://example.com/large.jpg']);
  });

  it('captures imagesrcset when no href is present', () => {
    const set = new Set();
    handleMeta(el('link', {
      rel: 'preload',
      as: 'image',
      imagesrcset: 'https://example.com/only.jpg 400w'
    }), set);
    expect([...set]).toEqual(['https://example.com/only.jpg']);
  });

  // resolveUrl's protocol allowlist has to hold on this path too: imagesrcset is
  // page-controlled like every other attribute we read.
  it('drops disallowed protocols in imagesrcset', () => {
    const set = new Set();
    handleMeta(el('link', {
      rel: 'preload',
      as: 'image',
      imagesrcset: 'javascript:alert(1) 400w, file:///etc/passwd 800w'
    }), set);
    expect([...set]).toEqual([]);
  });

  // An imagesrcset that yields no usable candidate must not swallow the href.
  it('falls back to href when imagesrcset yields nothing', () => {
    const set = new Set();
    handleMeta(el('link', {
      rel: 'preload',
      as: 'image',
      imagesrcset: '',
      href: 'https://example.com/fallback.jpg'
    }), set);
    expect([...set]).toEqual(['https://example.com/fallback.jpg']);
  });

  it('captures link icons and og:image:secure_url', () => {
    const set = new Set();
    handleMeta(el('meta', { property: 'og:image:secure_url', content: 'https://example.com/secure.jpg' }), set);
    handleMeta(el('link', { rel: 'apple-touch-icon', href: 'https://example.com/apple.png' }), set);
    handleMeta(el('link', { rel: 'icon', href: 'https://example.com/icon.png' }), set);
    expect([...set]).toEqual([
      'https://example.com/secure.jpg',
      'https://example.com/apple.png',
      'https://example.com/icon.png'
    ]);
  });

  it('captures meta/link schema.org images and mask icons', () => {
    const set = new Set();
    handleMeta(el('meta', { itemprop: 'image', content: 'https://example.com/schema.jpg' }), set);
    handleMeta(el('link', { itemprop: 'image', href: 'https://example.com/schemalink.jpg' }), set);
    handleMeta(el('link', { rel: 'mask-icon', href: 'https://example.com/mask.svg' }), set);
    expect([...set]).toEqual([
      'https://example.com/schema.jpg',
      'https://example.com/schemalink.jpg',
      'https://example.com/mask.svg'
    ]);
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

  // Regression: a naive split(',') shreds CDN transform URLs (Cloudinary/imgix
  // style `w_800,h_800`) into fragments that then flood the grid as broken
  // entries. The comma only separates candidates when it is not inside the URL.
  it('keeps commas that are inside the URL rather than separating candidates', () => {
    expect(pickBestFromSrcset('https://cdn.test/w_100,h_100/a.jpg 400w, https://cdn.test/w_800,h_800/b.jpg 1200w'))
      .toBe('https://cdn.test/w_800,h_800/b.jpg');
    expect(pickBestFromSrcset('https://cdn.test/a,b.jpg')).toBe('https://cdn.test/a,b.jpg');
  });

  it('splits on a comma glued to the URL with no following space', () => {
    expect(pickBestFromSrcset('a.jpg 1x,b.jpg 2x')).toBe('b.jpg');
    expect(pickBestFromSrcset('a.jpg, b.jpg 2x')).toBe('b.jpg');
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

  // Regression: the attribute chain used to short-circuit on `srcset`, so a
  // placeholder srcset next to the real `data-srcset` dropped the only
  // full-resolution URL on the page. Every populated variant is now tracked;
  // the >=200x200 filter is what culls the placeholder later.
  it('keeps the data-srcset variant when a placeholder srcset is present', () => {
    const imageSet = new Set();
    const picture = el('picture');
    const source = el('source', {
      srcset: 'https://example.com/placeholder.jpg 1w',
      'data-srcset': 'https://example.com/real-2000.jpg 2000w'
    });
    picture.appendChild(source);

    handlePicture(picture, imageSet);
    expect([...imageSet].sort()).toEqual([
      'https://example.com/placeholder.jpg',
      'https://example.com/real-2000.jpg'
    ]);
  });

  it('keeps the data-src variant when a placeholder src is present', () => {
    const imageSet = new Set();
    const picture = el('picture');
    const source = el('source', {
      src: 'https://example.com/tiny.jpg',
      'data-src': 'https://example.com/full.jpg'
    });
    picture.appendChild(source);

    handlePicture(picture, imageSet);
    expect([...imageSet].sort()).toEqual([
      'https://example.com/full.jpg',
      'https://example.com/tiny.jpg'
    ]);
  });

  // A source whose only variant is an inline data: URI tracked nothing at all
  // (trackImageUrl rejects data:), so it must not count as "usable" and hide
  // the sibling that carries the real URL.
  it('does not let a data:-only source shadow the next source', () => {
    const imageSet = new Set();
    const picture = el('picture');
    const lqip = el('source', {
      srcset: 'data:image/gif;base64,R0lGODlhAQABAAAAACw= 1w'
    });
    const real = el('source', { 'data-src': 'https://example.com/real.jpg' });
    picture.appendChild(lqip);
    picture.appendChild(real);

    handlePicture(picture, imageSet);
    expect([...imageSet]).toEqual(['https://example.com/real.jpg']);
  });

  // The flip side: once a source yields a real URL the scan stops, so a
  // <picture> still contributes one image rather than one per breakpoint.
  it('stops at the first usable source', () => {
    const imageSet = new Set();
    const picture = el('picture');
    const first = el('source', { srcset: 'https://example.com/webp.webp 800w' });
    const second = el('source', { srcset: 'https://example.com/jpeg.jpg 800w' });
    picture.appendChild(first);
    picture.appendChild(second);

    handlePicture(picture, imageSet);
    expect([...imageSet]).toEqual(['https://example.com/webp.webp']);
  });
});

describe('getCssMediaUrls', () => {
  const { getCssMediaUrls } = require('../src/content.js');
  let originalGetComputedStyle;

  beforeEach(() => {
    originalGetComputedStyle = window.getComputedStyle;
  });

  afterEach(() => {
    window.getComputedStyle = originalGetComputedStyle;
  });

  it('extracts URLs from various CSS properties and pseudo-elements (computed path)', () => {
    const el = document.createElement('div');
    // Force the computed path: give it a class
    el.className = 'test-class';

    window.getComputedStyle = jest.fn((element, pseudoElt) => {
      if (pseudoElt === '::before') {
        return { content: 'url("https://example.com/before.png")', getPropertyValue: () => '' };
      }
      if (pseudoElt === '::after') {
        return { backgroundImage: 'url("https://example.com/after.png")', getPropertyValue: () => '' };
      }
      return {
        backgroundImage: 'url("https://example.com/bg.jpg")',
        maskImage: 'url("https://example.com/mask.svg")',
        webkitMaskImage: 'url("https://example.com/webkit-mask.svg")',
        getPropertyValue: (prop) => {
          if (prop === 'mask-image') return 'url("https://example.com/mask-prop.svg")';
          if (prop === '-webkit-mask-image') return 'url("https://example.com/webkit-mask-prop.svg")';
          return '';
        }
      };
    });

    const urls = getCssMediaUrls(el);
    expect(window.getComputedStyle).toHaveBeenCalled();
    expect(urls).toContain('https://example.com/bg.jpg');
    expect(urls).toContain('https://example.com/mask.svg');
    expect(urls).toContain('https://example.com/webkit-mask.svg');
    expect(urls).toContain('https://example.com/before.png');
    expect(urls).toContain('https://example.com/after.png');
  });

  it('skips getComputedStyle on the inline fast path when appropriate', () => {
    const el = document.createElement('div');
    // No class, no id, no mask or content in style
    el.style.backgroundImage = 'url("https://example.com/inline-bg.jpg")';

    window.getComputedStyle = jest.fn();

    const urls = getCssMediaUrls(el);

    expect(window.getComputedStyle).not.toHaveBeenCalled();
    expect(urls).toContain('https://example.com/inline-bg.jpg');
  });

  it('uses display accurate path when requested even if it could take inline fast path', () => {
    const el = document.createElement('div');
    // Set an inline style, but request display accurate
    el.style.backgroundImage = 'url("https://example.com/inline-bg.jpg")';

    window.getComputedStyle = jest.fn((element, pseudoElt) => {
      if (pseudoElt) return { getPropertyValue: () => '' };
      return {
        backgroundImage: 'url("https://example.com/computed-bg.jpg")',
        getPropertyValue: () => ''
      };
    });

    const urls = getCssMediaUrls(el, true);

    expect(window.getComputedStyle).toHaveBeenCalled();
    expect(urls).toContain('https://example.com/computed-bg.jpg');
    expect(urls).not.toContain('https://example.com/inline-bg.jpg');
  });

  it('catches and ignores getComputedStyle errors for pseudo-elements', () => {
    const el = document.createElement('div');
    el.className = 'test'; // Force computed path
    window.getComputedStyle = jest.fn((element, pseudoElt) => {
      if (pseudoElt) {
        throw new Error('Not implemented');
      }
      return {
        backgroundImage: 'url("https://example.com/bg.jpg")',
        getPropertyValue: () => ''
      };
    });

    const urls = getCssMediaUrls(el);
    expect(urls).toEqual(['https://example.com/bg.jpg']);
  });
});

describe('handleDataBg', () => {
  const { handleDataBg } = require('../src/content.js');

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  it('extracts direct URLs from data-bg attributes', () => {
    const set = new Set();
    handleDataBg(el('div', { 'data-bg': 'https://example.com/direct.jpg' }), set);
    expect([...set]).toEqual(['https://example.com/direct.jpg']);
  });

  it('extracts css wrapped URLs from data-bg attributes', () => {
    const set = new Set();
    handleDataBg(el('div', { 'data-background-image': "url('https://example.com/css.png')" }), set);
    expect([...set]).toEqual(['https://example.com/css.png']);
  });

  it('ignores invalid direct URLs', () => {
    const set = new Set();
    handleDataBg(el('div', { 'data-bg-src': 'not_an_image' }), set);
    expect(set.size).toBe(0);
  });
});

describe('handleSrcset', () => {
  const { handleSrcset } = require('../src/content.js');

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  it('extracts imagesrcset on the MutationObserver path', () => {
    const set = new Set();
    handleSrcset(el('link', {
      rel: 'preload',
      as: 'image',
      imagesrcset: 'https://example.com/small.jpg 200w, https://example.com/big.jpg 900w'
    }), set);
    expect([...set]).toEqual(['https://example.com/big.jpg']);
  });

  it('still prefers a plain srcset over imagesrcset', () => {
    const set = new Set();
    handleSrcset(el('img', {
      srcset: 'https://example.com/from-srcset.jpg 800w',
      imagesrcset: 'https://example.com/from-imagesrcset.jpg 900w'
    }), set);
    expect([...set]).toEqual(['https://example.com/from-srcset.jpg']);
  });
});

describe('handleVideo', () => {
  const { handleVideo } = require('../src/content.js');

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  it('extracts src and poster from video elements', () => {
    const imageSet = new Set();
    const videoSet = new Set();

    handleVideo(el('video', {
      src: 'https://example.com/video.mp4',
      poster: 'https://example.com/poster.jpg'
    }), imageSet, videoSet);

    expect([...videoSet]).toEqual(['https://example.com/video.mp4']);
    expect([...imageSet]).toEqual(['https://example.com/poster.jpg']);
  });

  // The lazy-load pattern: a placeholder in `src` and the real file in `data-src`.
  // A `src || data-src` chain short-circuits on the placeholder and the real video
  // is never discovered at all. Both must be tracked; videos skip the size filter,
  // so nothing downstream would recover the miss.
  it('tracks every populated src attribute, not just the first', () => {
    const imageSet = new Set();
    const videoSet = new Set();

    handleVideo(el('video', {
      src: 'https://example.com/placeholder.mp4',
      'data-src': 'https://example.com/real-1080p.mp4'
    }), imageSet, videoSet);

    expect([...videoSet].sort()).toEqual([
      'https://example.com/placeholder.mp4',
      'https://example.com/real-1080p.mp4'
    ]);
  });

  it('tracks both poster and data-poster', () => {
    const imageSet = new Set();
    const videoSet = new Set();

    handleVideo(el('video', {
      poster: 'https://example.com/blank.gif',
      'data-poster': 'https://example.com/real-poster.jpg'
    }), imageSet, videoSet);

    expect([...imageSet].sort()).toEqual([
      'https://example.com/blank.gif',
      'https://example.com/real-poster.jpg'
    ]);
  });

  it('extracts lazy loaded attributes into correct sets', () => {
    const attrs = ['data-src', 'data-lazy-src', 'data-original'];

    for (const attr of attrs) {
      const imageSet = new Set();
      const videoSet = new Set();

      const vEl = el('video');
      vEl.setAttribute(attr, `https://example.com/${attr}.webm`);
      vEl.setAttribute('data-poster', `https://example.com/${attr}_poster.webp`);

      handleVideo(vEl, imageSet, videoSet);

      expect([...videoSet]).toEqual([`https://example.com/${attr}.webm`]);
      expect([...imageSet]).toEqual([`https://example.com/${attr}_poster.webp`]);
    }
  });

  it('skips data: URLs for both video and poster', () => {
    const imageSet = new Set();
    const videoSet = new Set();

    handleVideo(el('video', {
      src: 'data:video/mp4;base64,123',
      poster: 'data:image/jpeg;base64,456'
    }), imageSet, videoSet);

    expect(videoSet.size).toBe(0);
    expect(imageSet.size).toBe(0);
  });
});

describe('trackImageUrl', () => {
  const { trackImageUrl } = require('../src/content.js');

  it('adds original URL and synthesizes original for WordPress downscaled images', () => {
    const set = new Set();
    trackImageUrl('https://example.com/photo-150x150.jpg', set);
    expect([...set]).toEqual([
      'https://example.com/photo-150x150.jpg',
      'https://example.com/photo.jpg'
    ]);
  });

  it('leaves standard URLs unaffected', () => {
    const set = new Set();
    trackImageUrl('https://example.com/photo.jpg', set);
    expect([...set]).toEqual(['https://example.com/photo.jpg']);
  });

  it('deduplicates if the synthesized URL is already present', () => {
    const set = new Set();
    set.add('https://example.com/photo.jpg');
    trackImageUrl('https://example.com/photo-150x150.jpg', set);
    expect([...set]).toEqual([
      'https://example.com/photo.jpg',
      'https://example.com/photo-150x150.jpg'
    ]);
  });

  // A synthesized URL that 404s is culled by the popup's new Image() probe — but
  // filterImagesBySize exempts .svg from probing entirely, so an unverifiable SVG
  // would survive to the grid. Synthesis must stay off SVG.
  it('does not synthesize an original for SVG variants', () => {
    const set = new Set();
    trackImageUrl('https://example.com/logo-150x150.svg', set);
    expect([...set]).toEqual(['https://example.com/logo-150x150.svg']);
  });

  it('does not synthesize from a dimension-like segment outside the filename suffix', () => {
    const set = new Set();
    trackImageUrl('https://example.com/1920x1080/photo.jpg', set);
    expect([...set]).toEqual(['https://example.com/1920x1080/photo.jpg']);
  });
});

describe('collectMediaUrls initial scan unified traversal', () => {
  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '';

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
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('dispatches to every source handler in one pass and keeps images and videos apart', () => {
    document.body.innerHTML = `
      <meta property="og:image" content="https://example.com/og.jpg">
      <img src="https://example.com/img.jpg" data-src="https://example.com/lazy.jpg">
      <div data-bg="https://example.com/data-bg.jpg"></div>
      <picture>
        <source srcset="https://example.com/source.jpg 800w">
        <img src="https://example.com/fallback.jpg">
      </picture>
      <video poster="https://example.com/poster.jpg" src="https://example.com/video.mp4"></video>
      <object data="https://example.com/object.jpg"></object>
      <svg><image href="https://example.com/svg.jpg"></image></svg>
      <div style="background-image: url('https://example.com/style.jpg')"></div>
    `;

    const { collectMediaUrls } = require('../src/content.js');
    const { imageUrls, videoUrls } = collectMediaUrls();

    // One URL per handler the traversal is responsible for reaching.
    expect(imageUrls.has('https://example.com/og.jpg')).toBe(true);        // handleMeta
    expect(imageUrls.has('https://example.com/img.jpg')).toBe(true);       // <img src>
    expect(imageUrls.has('https://example.com/lazy.jpg')).toBe(true);      // lazy-load attrs
    expect(imageUrls.has('https://example.com/data-bg.jpg')).toBe(true);   // handleDataBg
    expect(imageUrls.has('https://example.com/source.jpg')).toBe(true);    // handleSource
    expect(imageUrls.has('https://example.com/fallback.jpg')).toBe(true);  // <picture> fallback
    expect(imageUrls.has('https://example.com/poster.jpg')).toBe(true);    // handleVideo poster
    expect(imageUrls.has('https://example.com/object.jpg')).toBe(true);    // handleEmbed
    expect(imageUrls.has('https://example.com/svg.jpg')).toBe(true);       // handleSvgImage

    // The two sets must not cross: a video source is never an image.
    expect(videoUrls.has('https://example.com/video.mp4')).toBe(true);
    expect(imageUrls.has('https://example.com/video.mp4')).toBe(false);

    // An *inline* style attribute is reached synchronously by the TreeWalker
    // attribute sweep — no getComputedStyle involved. Only stylesheet-driven
    // backgrounds go through the deferred idle queue.
    expect(imageUrls.has('https://example.com/style.jpg')).toBe(true);
  });
});
