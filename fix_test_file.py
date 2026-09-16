with open('tests/content.test.js', 'r') as f:
    lines = f.readlines()

new_lines = []
in_block = False
for line in lines:
    if line.startswith("describe('handleScript & extractMediaFromJson', () => {"):
        in_block = True
    if not in_block:
        new_lines.append(line)

new_tests = """
describe('handleScript & extractMediaFromJson', () => {
  const { handleScript, extractMediaFromJson } = require('../src/content.js');

  function el(tag, attrs = {}) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  }

  it('extracts extensionless image URLs from specific JSON keys', () => {
    const imageSet = new Set();
    const videoSet = new Set();
    const data = {
      "@context": "https://schema.org",
      "@type": "Article",
      "image": "https://example.com/images/extensionless-hero",
      "thumbnailUrl": [
         "https://example.com/thumb1",
         "https://example.com/thumb2.jpg"
      ]
    };
    const script = el('script', { type: 'application/ld+json' });
    script.textContent = JSON.stringify(data);

    handleScript(script, imageSet, videoSet);

    expect([...imageSet]).toEqual([
       'https://example.com/images/extensionless-hero',
       'https://example.com/thumb1',
       'https://example.com/thumb2.jpg'
    ]);
  });

  it('extracts video URLs from contentUrl when @type is VideoObject', () => {
    const imageSet = new Set();
    const videoSet = new Set();
    const data = {
      "@type": "VideoObject",
      "contentUrl": "https://example.com/video/stream.mp4"
    };

    const script = el('script', { type: 'application/ld+json' });
    script.textContent = JSON.stringify(data);

    handleScript(script, imageSet, videoSet);

    expect([...videoSet]).toEqual([
       'https://example.com/video/stream.mp4'
    ]);
  });

  it('drops embedUrl entirely and ignores contentUrl without media type format', () => {
    const imageSet = new Set();
    const videoSet = new Set();
    const data = {
      "@type": "VideoObject",
      "contentUrl": "https://example.com/player",
      "embedUrl": "https://example.com/embed/12345",
      "encodingFormat": "text/html"
    };

    const script = el('script', { type: 'application/ld+json' });
    script.textContent = JSON.stringify(data);

    handleScript(script, imageSet, videoSet);

    expect([...videoSet]).toEqual([]);
    expect([...imageSet]).toEqual([]);
  });

  it('treats contentUrl as image when @type is ImageObject', () => {
    const imageSet = new Set();
    const videoSet = new Set();
    const data = {
      "@type": "ImageObject",
      "contentUrl": "https://example.com/image"
    };

    const script = el('script', { type: 'application/ld+json' });
    script.textContent = JSON.stringify(data);

    handleScript(script, imageSet, videoSet);

    expect([...imageSet]).toEqual(['https://example.com/image']);
  });

  it('recursively searches nested objects for known keys', () => {
    const imageSet = new Set();
    const videoSet = new Set();
    const data = {
       "publisher": {
          "logo": {
             "url": "https://example.com/logo-img"
          }
       },
       "about": [
          { "image": "https://example.com/about1" },
          { "image": { "url": "https://example.com/about2" } }
       ],
       "random": "https://example.com/not-an-image"
    };

    const script = el('script', { type: 'application/ld+json' });
    script.textContent = JSON.stringify(data);

    handleScript(script, imageSet, videoSet);

    expect([...imageSet].sort()).toEqual([
       'https://example.com/about1',
       'https://example.com/about2',
       'https://example.com/logo-img'
    ]);
  });

  it('gracefully handles invalid JSON', () => {
    const imageSet = new Set();
    const videoSet = new Set();
    const script = el('script', { type: 'application/ld+json' });
    script.textContent = '{"invalid json';

    expect(() => handleScript(script, imageSet, videoSet)).not.toThrow();
    expect(imageSet.size).toBe(0);
  });

  it('ignores application/json script types', () => {
    const imageSet = new Set();
    const videoSet = new Set();
    const script = el('script', { type: 'application/json' });
    script.textContent = JSON.stringify({ image: 'https://example.com/test.jpg' });

    handleScript(script, imageSet, videoSet);
    expect(imageSet.size).toBe(0);
  });
});
"""

with open('tests/content.test.js', 'w') as f:
    f.writelines(new_lines)
    f.write(new_tests)
