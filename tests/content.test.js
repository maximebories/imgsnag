/** @jest-environment jsdom */
// Mock global variables used in content.js
global.browser = {
  runtime: {
    onConnect: { addListener: jest.fn() },
    sendMessage: jest.fn().mockResolvedValue(),
  },
  storage: {
    sync: {
      get: jest.fn().mockResolvedValue({ disableDrag: false }),
    },
    onChanged: { addListener: jest.fn() },
  },
};

global.chrome = global.browser;

const { parseSrcset } = require('../src/content.js');

describe('parseSrcset', () => {
  it('should return an empty array for undefined or null', () => {
    expect(parseSrcset(undefined)).toEqual([]);
    expect(parseSrcset(null)).toEqual([]);
    expect(parseSrcset('')).toEqual([]);
  });

  it('should parse a single URL', () => {
    const srcset = 'image.png';
    expect(parseSrcset(srcset)).toEqual(['image.png']);
  });

  it('should parse a single URL with descriptor', () => {
    const srcset = 'image.png 2x';
    expect(parseSrcset(srcset)).toEqual(['image.png']);
  });

  it('should parse multiple URLs separated by commas', () => {
    const srcset = 'image1.png, image2.png';
    expect(parseSrcset(srcset)).toEqual(['image1.png', 'image2.png']);
  });

  it('should parse multiple URLs with descriptors', () => {
    const srcset = 'image1.png 1x, image2.png 2x';
    expect(parseSrcset(srcset)).toEqual(['image1.png', 'image2.png']);
  });

  it('should handle extra whitespace around URLs and commas', () => {
    const srcset = '  image1.png   100w ,  image2.png   200w  ';
    expect(parseSrcset(srcset)).toEqual(['image1.png', 'image2.png']);
  });

  it('should ignore empty entries caused by trailing commas', () => {
    const srcset = 'image1.png 1x, ';
    expect(parseSrcset(srcset)).toEqual(['image1.png']);
  });

  it('should handle complex URLs with query parameters', () => {
    const srcset = 'https://example.com/img?w=100&h=200 100w, https://example.com/img2?w=200 200w';
    expect(parseSrcset(srcset)).toEqual(['https://example.com/img?w=100&h=200', 'https://example.com/img2?w=200']);
  });
});
