/**
 * @jest-environment jsdom
 */

describe('REGEX_SWEEP_FILTER filter optimizations', () => {
  let REGEX_SWEEP_FILTER;

  beforeEach(() => {
    jest.resetModules();

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

    document.body.innerHTML = '';
    const content = require('../src/content.js');
    REGEX_SWEEP_FILTER = content.REGEX_SWEEP_FILTER;
  });

  it('skips elements with no attributes rather than accepting or rejecting them', () => {
    const el = document.createElement('div');
    expect(REGEX_SWEEP_FILTER.acceptNode(el)).toBe(NodeFilter.FILTER_SKIP);
  });

  it('accepts elements that have attributes', () => {
    const el = document.createElement('div');
    el.setAttribute('class', 'foo');
    expect(REGEX_SWEEP_FILTER.acceptNode(el)).toBe(NodeFilter.FILTER_ACCEPT);
  });

  it('rejects style elements', () => {
    const el = document.createElement('style');
    expect(REGEX_SWEEP_FILTER.acceptNode(el)).toBe(NodeFilter.FILTER_REJECT);
  });

  it('rejects script elements without JSON type', () => {
    const el = document.createElement('script');
    expect(REGEX_SWEEP_FILTER.acceptNode(el)).toBe(NodeFilter.FILTER_REJECT);
  });

  it('accepts script elements with JSON-LD type', () => {
    const el = document.createElement('script');
    el.setAttribute('type', 'application/ld+json');
    expect(REGEX_SWEEP_FILTER.acceptNode(el)).toBe(NodeFilter.FILTER_ACCEPT);
  });

  it('accepts script elements with JSON type', () => {
    const el = document.createElement('script');
    el.setAttribute('type', 'application/json');
    expect(REGEX_SWEEP_FILTER.acceptNode(el)).toBe(NodeFilter.FILTER_ACCEPT);
  });
});
