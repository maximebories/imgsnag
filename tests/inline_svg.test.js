const { collectInlineSvgs } = require('../src/content.js');

describe('collectInlineSvgs', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('rejects markup containing <use> even with namespaces to prevent evasion', () => {
    document.body.innerHTML = `
      <svg style="width: 250px; height: 250px;">
        <foo:use href="#foo" />
      </svg>
      <svg style="width: 250px; height: 250px;">
        <use href="#bar" />
      </svg>
      <svg style="width: 250px; height: 250px;">
        <circle cx="50" cy="50" r="40" stroke="black" stroke-width="3" fill="red" />
      </svg>
    `;

    // jsdom doesn't compute layout, so mock getBoundingClientRect
    const svgs = document.querySelectorAll('svg');
    svgs.forEach(svg => {
      svg.getBoundingClientRect = () => ({ width: 250, height: 250 });
    });

    const items = collectInlineSvgs();

    expect(items.length).toBe(1);
    expect(decodeURIComponent(items[0].url)).not.toMatch(/use/i);
    expect(decodeURIComponent(items[0].url)).toMatch(/circle/);
  });
});
