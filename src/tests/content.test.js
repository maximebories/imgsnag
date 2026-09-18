/**
 * @jest-environment jsdom
 */

// Mock browser extension APIs
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

const { resolveUrl } = require('../content.js');

describe('resolveUrl', () => {
  it('should resolve absolute URLs as-is', () => {
    const url = 'https://example.com/image.jpg';
    expect(resolveUrl(url)).toBe(url);
  });

  it('should accept allowed protocols like blob: and data:', () => {
    expect(resolveUrl('blob:https://example.com/a123')).toBe('blob:https://example.com/a123');
    expect(resolveUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
  });

  // resolveUrl returns the *normalized* parsed.href, never the raw input — background.js
  // relies on that to keep the two URL parsers from disagreeing. Fails on a pass-through.
  it('should return the normalized href rather than the raw input string', () => {
    expect(resolveUrl('HTTP://Example.COM/A.JPG')).toBe('http://example.com/A.JPG');
  });

  it('should resolve relative URLs against the current location', () => {
    // jsdom sets window.location.href to 'http://localhost/' by default
    expect(resolveUrl('/path/to/image.png')).toBe('http://localhost/path/to/image.png');
    expect(resolveUrl('image.gif')).toBe('http://localhost/image.gif');
    expect(resolveUrl('./image.webp')).toBe('http://localhost/image.webp');
    expect(resolveUrl('../image.svg')).toBe('http://localhost/image.svg'); // Resolves relative to root since base is /
  });

  it('should return null for empty or falsy inputs', () => {
    expect(resolveUrl(null)).toBeNull();
    expect(resolveUrl('')).toBeNull();
    expect(resolveUrl(undefined)).toBeNull();
    expect(resolveUrl(false)).toBeNull();
  });

  it('should reject non-allowlisted protocols like javascript:, file:, chrome:, and ftp:', () => {
    expect(resolveUrl('javascript:alert(1)')).toBeNull();
    expect(resolveUrl('file:///etc/passwd')).toBeNull();
    expect(resolveUrl('chrome://settings')).toBeNull();
    expect(resolveUrl('ftp://example.com/file')).toBeNull();
  });

  it('should return null for invalid URLs that cause new URL() to throw', () => {
    // new URL() throws a TypeError for URLs that it cannot parse
    // A string starting with 'http://%' is an invalid URL in the Node environment
    expect(resolveUrl('http://%')).toBeNull();
  });
});
