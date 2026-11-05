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

const { collectInlineSvgs } = require('../src/content.js');

describe('collectInlineSvgs <use> exclusion', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('excludes SVGs containing <use>', () => {
    document.body.innerHTML = `
      <svg width="200" height="200">
        <use href="#icon"/>
      </svg>
    `;

    // jsdom doesn't set width/height from attributes for getBoundingClientRect
    const svg = document.querySelector('svg');
    svg.getBoundingClientRect = () => ({ width: 200, height: 200 });

    const items = collectInlineSvgs();
    expect(items.length).toBe(0);
  });

  it('excludes SVGs containing prefixed <some:use>', () => {
    // The HTML parser keeps foreign-content prefixes in the local name, so querySelector('use') misses it.
    // Warden fixed this by running a regex over the serialized markup: /<(?:[^>\\s:]+:)?use\\b/i
    document.body.innerHTML = `
      <svg width="200" height="200">
        <some:use href="#icon"/>
      </svg>
    `;
    const svg = document.querySelector('svg');
    svg.getBoundingClientRect = () => ({ width: 200, height: 200 });

    const items = collectInlineSvgs();
    expect(items.length).toBe(0);
  });

  it('excludes SVGs containing XML-valid complex prefixed <some_use.x:use>', () => {
    document.body.innerHTML = `
      <svg width="200" height="200">
        <some_use.x:use href="#icon"/>
      </svg>
    `;
    const svg = document.querySelector('svg');
    svg.getBoundingClientRect = () => ({ width: 200, height: 200 });

    const items = collectInlineSvgs();
    expect(items.length).toBe(0);
  });

  it('captures SVGs that do not contain <use>', () => {
    document.body.innerHTML = `
      <svg width="200" height="200">
        <rect width="10" height="10"/>
      </svg>
    `;
    const svg = document.querySelector('svg');
    svg.getBoundingClientRect = () => ({ width: 200, height: 200 });

    const items = collectInlineSvgs();
    expect(items.length).toBe(1);
    expect(items[0].url).toContain('rect');
  });
});
