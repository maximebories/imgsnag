// Mock the browser global object before requiring the content script
global.browser = {
  runtime: {
    onConnect: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn(() => Promise.resolve()),
  },
  storage: {
    sync: {
      get: jest.fn(() => Promise.resolve({ disableDrag: false })),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
};

// Require the content script which executes the IIFE
const { isVideoUrl, isImageUrl, isSvgUrl, collectInlineSvgs } = require('./content');

describe('isVideoUrl', () => {
  describe('valid video URLs', () => {
    const videoExtensions = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'avi'];

    videoExtensions.forEach((ext) => {
      it(`should return true for a valid .${ext} URL`, () => {
        expect(isVideoUrl(`https://example.com/video.${ext}`)).toBe(true);
      });

      it(`should return true for a valid .${ext} URL with query parameters`, () => {
        expect(isVideoUrl(`https://example.com/video.${ext}?v=123&autoplay=1`)).toBe(true);
      });

      it(`should return true for a valid .${ext} URL with hash fragments`, () => {
        expect(isVideoUrl(`https://example.com/video.${ext}#time=10`)).toBe(true);
      });

      it(`should return true for a valid uppercase .${ext.toUpperCase()} URL`, () => {
        expect(isVideoUrl(`https://example.com/video.${ext.toUpperCase()}`)).toBe(true);
      });

      it(`should return true for a valid URL with mixed case .${ext.charAt(0).toUpperCase() + ext.slice(1)}`, () => {
        const mixedCaseExt = ext.charAt(0).toUpperCase() + ext.slice(1);
        expect(isVideoUrl(`https://example.com/video.${mixedCaseExt}`)).toBe(true);
      });
    });
  });

  describe('invalid or non-video URLs', () => {
    it('should return false for image URLs', () => {
      expect(isVideoUrl('https://example.com/image.jpg')).toBe(false);
      expect(isVideoUrl('https://example.com/image.png')).toBe(false);
      expect(isVideoUrl('https://example.com/image.gif')).toBe(false);
    });

    it('should return false for web page URLs', () => {
      expect(isVideoUrl('https://example.com/page.html')).toBe(false);
      expect(isVideoUrl('https://example.com/')).toBe(false);
    });

    it('should return false for URLs with video extensions elsewhere in the path', () => {
      // The extension should be at the end of the pathname
      expect(isVideoUrl('https://example.com/video.mp4/page.html')).toBe(false);
    });

    it('should return false for URLs where extension is part of a longer extension', () => {
      expect(isVideoUrl('https://example.com/video.mp4xyz')).toBe(false);
    });

    it('should return false for malformed URLs that cannot be parsed', () => {
      expect(isVideoUrl('not_a_valid_url')).toBe(false);
    });

    it('should return false for completely unrelated domains with no path', () => {
       expect(isVideoUrl('https://mp4.example.com')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for null', () => {
      expect(isVideoUrl(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isVideoUrl(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isVideoUrl('')).toBe(false);
    });
  });
});

describe('isImageUrl', () => {
  describe('valid image URLs', () => {
    const imageExtensions = ['jpg', 'jpeg', 'gif', 'png', 'webp', 'svg', 'avif'];

    imageExtensions.forEach((ext) => {
      it(`should return true for a valid .${ext} URL`, () => {
        expect(isImageUrl(`https://example.com/image.${ext}`)).toBe(true);
      });

      it(`should return true for a valid .${ext} URL with query parameters`, () => {
        expect(isImageUrl(`https://example.com/image.${ext}?v=123`)).toBe(true);
      });

      it(`should return true for a valid .${ext} URL with hash fragments`, () => {
        expect(isImageUrl(`https://example.com/image.${ext}#hash`)).toBe(true);
      });

      it(`should return true for a valid uppercase .${ext.toUpperCase()} URL`, () => {
        expect(isImageUrl(`https://example.com/image.${ext.toUpperCase()}`)).toBe(true);
      });
    });

    it('should return true for data:image/ URLs', () => {
      expect(isImageUrl('data:image/png;base64,iVBORw0KGgo')).toBe(true);
    });
  });

  describe('invalid or non-image URLs', () => {
    it('should return false for video URLs', () => {
      expect(isImageUrl('https://example.com/video.mp4')).toBe(false);
      expect(isImageUrl('https://example.com/video.webm')).toBe(false);
    });

    it('should return false for web page URLs', () => {
      expect(isImageUrl('https://example.com/page.html')).toBe(false);
      expect(isImageUrl('https://example.com/')).toBe(false);
    });

    it('should return false for URLs with image extensions elsewhere in the path', () => {
      expect(isImageUrl('https://example.com/image.jpg/page.html')).toBe(false);
    });

    it('should return false for malformed URLs that cannot be parsed', () => {
      expect(isImageUrl('not_a_valid_url')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for null', () => {
      expect(isImageUrl(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isImageUrl(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isImageUrl('')).toBe(false);
    });
  });
});

describe('isSvgUrl', () => {
  describe('valid SVG URLs', () => {
    it('should return true for a valid .svg URL', () => {
      expect(isSvgUrl('https://example.com/image.svg')).toBe(true);
    });

    it('should return true for a valid .svg URL with query parameters', () => {
      expect(isSvgUrl('https://example.com/image.svg?v=123&scale=1')).toBe(true);
    });

    it('should return true for a valid .svg URL with hash fragments', () => {
      expect(isSvgUrl('https://example.com/image.svg#icon')).toBe(true);
    });

    it('should return true for a valid uppercase .SVG URL', () => {
      expect(isSvgUrl('https://example.com/image.SVG')).toBe(true);
    });

    it('should return true for a valid URL with mixed case .Svg', () => {
      expect(isSvgUrl('https://example.com/image.Svg')).toBe(true);
    });
  });

  describe('invalid or non-SVG URLs', () => {
    it('should return false for other image URLs', () => {
      expect(isSvgUrl('https://example.com/image.jpg')).toBe(false);
      expect(isSvgUrl('https://example.com/image.png')).toBe(false);
    });

    it('should return false for web page URLs', () => {
      expect(isSvgUrl('https://example.com/page.html')).toBe(false);
      expect(isSvgUrl('https://example.com/')).toBe(false);
    });

    it('should return false for URLs with svg elsewhere in the path', () => {
      expect(isSvgUrl('https://example.com/image.svg/page.html')).toBe(false);
    });

    it('should return false for URLs where svg is part of a longer extension', () => {
      expect(isSvgUrl('https://example.com/image.svgz')).toBe(false);
    });

    it('should return false for malformed URLs that cannot be parsed', () => {
      expect(isSvgUrl('not_a_valid_url')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for null', () => {
      expect(isSvgUrl(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isSvgUrl(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isSvgUrl('')).toBe(false);
    });
  });
});

describe('collectInlineSvgs', () => {
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function addSvg({ width = 300, height = 300, withUse = false } = {}) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.getBoundingClientRect = () => ({ width, height });
    const rect = document.createElementNS(SVG_NS, 'rect');
    svg.appendChild(rect);
    if (withUse) svg.appendChild(document.createElementNS(SVG_NS, 'use'));
    document.body.appendChild(svg);
    return svg;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('captures a large inline SVG as a derived data: URL item', () => {
    addSvg({ width: 320, height: 250 });
    const items = collectInlineSvgs();
    expect(items).toHaveLength(1);
    expect(items[0].url.startsWith('data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(items[0].derived).toBe(true);
    expect(items[0].type).toBe('image');
    expect(items[0].width).toBe(320);
    expect(items[0].height).toBe(250);
    const markup = decodeURIComponent(items[0].url.split(',').slice(1).join(','));
    expect(markup).toContain('<svg');
    expect(markup).toContain('rect');
  });

  it('skips SVGs rendered below the minimum size', () => {
    addSvg({ width: 24, height: 24 });
    addSvg({ width: 300, height: 100 });
    expect(collectInlineSvgs()).toHaveLength(0);
  });

  it('skips SVGs containing <use> references (stage 1)', () => {
    addSvg({ withUse: true });
    expect(collectInlineSvgs()).toHaveLength(0);
  });
});

describe('handleEmbed', () => {
  const { handleEmbed } = require('./content');

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  it('captures object[data] pointing at an image file', () => {
    const set = new Set();
    handleEmbed(el('object', { data: 'https://example.com/logo.svg' }), set);
    expect([...set]).toEqual(['https://example.com/logo.svg']);
  });

  it('captures embed[src] and iframe[src] image URLs', () => {
    const set = new Set();
    handleEmbed(el('embed', { src: 'https://example.com/pic.png' }), set);
    handleEmbed(el('iframe', { src: 'https://example.com/photo.jpg' }), set);
    expect(set.size).toBe(2);
  });

  it('ignores iframes pointing at pages and non-embed tags', () => {
    const set = new Set();
    handleEmbed(el('iframe', { src: 'https://example.com/page.html' }), set);
    handleEmbed(el('div', { src: 'https://example.com/pic.png' }), set);
    handleEmbed(el('object', {}), set);
    expect(set.size).toBe(0);
  });
});

describe('passesSizeFilter', () => {
  const { passesSizeFilter } = require('./content');

  it('rejects missing sizes (failed loads)', () => {
    expect(passesSizeFilter(null)).toBe(false);
    expect(passesSizeFilter(undefined)).toBe(false);
  });

  it('exempts 0×0 (extension-less SVG without intrinsic size)', () => {
    expect(passesSizeFilter({ width: 0, height: 0 })).toBe(true);
  });

  it('applies the minimum size to real bitmaps', () => {
    expect(passesSizeFilter({ width: 199, height: 300 })).toBe(false);
    expect(passesSizeFilter({ width: 300, height: 100 })).toBe(false);
    expect(passesSizeFilter({ width: 200, height: 200 })).toBe(true);
  });
});

describe('handleSvgImage', () => {
  const { handleSvgImage } = require('./content');
  it('extracts urls from href and xlink:href in image tags', () => {
    const imageSet = new Set();
    const el = document.createElement('image');
    el.setAttribute('href', 'https://example.com/svg_href.jpg');
    handleSvgImage(el, imageSet);
    expect(imageSet.has('https://example.com/svg_href.jpg')).toBe(true);

    const el2 = document.createElement('image');
    el2.setAttribute('xlink:href', 'https://example.com/svg_xlink.jpg');
    handleSvgImage(el2, imageSet);
    expect(imageSet.has('https://example.com/svg_xlink.jpg')).toBe(true);
  });
});
