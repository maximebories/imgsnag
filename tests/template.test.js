const { collectTemplateImages } = require('../src/content.js');

describe('collectTemplateImages', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts images and videos from inert template contents', () => {
    document.body.innerHTML = `
      <template>
        <img src="https://example.com/test.jpg">
        <img data-src="https://example.com/lazy.jpg">
        <video poster="https://example.com/video.jpg" src="https://example.com/video.mp4"></video>
        <div style="background-image: url('https://example.com/bg.jpg')"></div>
      </template>
    `;
    const { imageUrls, videoUrls } = collectTemplateImages();
    expect(imageUrls.has('https://example.com/test.jpg')).toBe(true);
    expect(imageUrls.has('https://example.com/lazy.jpg')).toBe(true);
    expect(imageUrls.has('https://example.com/video.jpg')).toBe(true);
    expect(imageUrls.has('https://example.com/bg.jpg')).toBe(true);
    expect(videoUrls.has('https://example.com/video.mp4')).toBe(true);
  });
});
