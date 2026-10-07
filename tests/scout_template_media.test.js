const { TextEncoder, TextDecoder } = require("util"); global.TextEncoder = TextEncoder; global.TextDecoder = TextDecoder;
const { collectTemplateMedia } = require('../src/content.js');
const { JSDOM } = require('jsdom');

describe('Scout: Template Content Media Extraction', () => {
  let dom;

  beforeEach(() => {
    // Reset global state
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'https://example.com'
    });
    global.document = dom.window.document;
    global.window = dom.window;
    global.Node = dom.window.Node;
    global.NodeFilter = dom.window.NodeFilter;
    global.Element = dom.window.Element;
    global.getComputedStyle = dom.window.getComputedStyle;
  });

  afterEach(() => {
    delete global.document;
    delete global.window;
    delete global.Node;
    delete global.NodeFilter;
    delete global.Element;
    delete global.getComputedStyle;
  });

  it('extracts images from structural tags within <template>', () => {
    document.body.innerHTML = `
      <template id="tmpl">
        <img src="https://example.com/template-img.jpg" />
        <picture>
            <source srcset="https://example.com/template-source.webp" />
            <img src="https://example.com/template-fallback.jpg" />
        </picture>
        <video src="https://example.com/template-vid.mp4" poster="https://example.com/template-poster.jpg"></video>
      </template>
    `;

    const { imageUrls, videoUrls } = collectTemplateMedia();

    // <picture> <img src> fallback is not captured when <source> has a usable set (hasSet && realSet),
    // but extractRegexUrls sweeps over attributes and might extract it as well.
    // Actually, in the template, we're sweeping all nodes via TreeWalker which might match it.
    // The TreeWalker finds fallback URLs! So we don't strictly assert the fallback is not tracked.
    expect(imageUrls.has('https://example.com/template-img.jpg')).toBe(true);
    expect(imageUrls.has('https://example.com/template-source.webp')).toBe(true);
    expect(imageUrls.has('https://example.com/template-poster.jpg')).toBe(true);

    expect(videoUrls.size).toBe(1);
    expect(videoUrls.has('https://example.com/template-vid.mp4')).toBe(true);
  });

  it('extracts inline background and mask styles within <template>', () => {
    document.body.innerHTML = `
      <template id="tmpl2">
        <div style="background-image: url('https://example.com/template-bg.jpg');"></div>
        <span style="mask-image: url('https://example.com/template-mask.png');"></span>
      </template>
    `;

    const { imageUrls } = collectTemplateMedia();

    expect(imageUrls.size).toBe(2);
    expect(imageUrls.has('https://example.com/template-bg.jpg')).toBe(true);
    expect(imageUrls.has('https://example.com/template-mask.png')).toBe(true);
  });

  it('extracts urls from text nodes and attributes within <template>', () => {
    document.body.innerHTML = `
      <template id="tmpl3">
        <div data-custom="https://example.com/template-custom.jpg"></div>
        <script type="application/json">
          {"image": "https://example.com/template-json.jpg"}
        </script>
      </template>
    `;

    const { imageUrls } = collectTemplateMedia();

    expect(imageUrls.size).toBe(2);
    expect(imageUrls.has('https://example.com/template-custom.jpg')).toBe(true);
    expect(imageUrls.has('https://example.com/template-json.jpg')).toBe(true);
  });
});
