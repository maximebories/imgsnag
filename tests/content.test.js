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
