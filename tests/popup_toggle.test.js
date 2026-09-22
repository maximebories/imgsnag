/**
 * @jest-environment jsdom
 */

document.body.innerHTML = `
  <div id="loading" class="visible"><span id="loading-text"></span></div>
  <div id="empty"><span id="empty-text"></span><span id="empty-hint"></span></div>
  <div id="error"><span id="error-text"></span></div>
  <ul id="grid"></ul>
  <div id="video-header"><span id="video-header-text"></span></div>
  <ul id="video-grid"></ul>
  <div id="bar">
    <span id="counter"></span>
    <span id="hidden-count"></span>
    <div class="actions">
      <kbd id="shortcut-hint" aria-hidden="true" style="display: none;"></kbd>
      <button id="btn-selected"></button>
      <button id="btn-all"></button>
    </div>
  </div>
`;

global.browser = {
  i18n: {
    getUILanguage: () => 'en',
    getMessage: (k, arr) => {
      if (k === 'popupSelect') return arr ? 'Select ' + arr[0] : 'Select';
      if (k === 'popupDeselect') return arr ? 'Deselect ' + arr[0] : 'Deselect';
      if (k === 'popupMediaFallback') return 'media';
      if (k === 'popupInlineSvg') return 'imgsnag-inline.svg';
      return arr ? arr.join(',') : k;
    }
  },
  runtime: { sendMessage: jest.fn().mockResolvedValue() },
  tabs: { query: jest.fn().mockResolvedValue([]), connect: jest.fn() }
};

describe('APG Checkbox Naming vs State', () => {
  beforeEach(() => {
    jest.resetModules();
    document.getElementById('grid').innerHTML = '';
  });

  it('maintains a static aria-label but updates title on toggle', () => {
    // We export wrapCell for testing
    const { wrapCell } = require('../src/popup.js');
    const cell = document.createElement('li');
    wrapCell(cell, { url: 'https://example.com/image.jpg', type: 'image' });

    const check = cell.querySelector('.check');

    // Initial state
    expect(check.getAttribute('aria-label')).toBe('image.jpg');
    expect(check.title).toBe('Select image.jpg');
    expect(check.getAttribute('aria-checked')).toBe('false');

    // simulate click
    check.click();
    expect(check.getAttribute('aria-label')).toBe('image.jpg'); // Static
    expect(check.title).toBe('Deselect image.jpg');             // Dynamic future action
    expect(check.getAttribute('aria-checked')).toBe('true');    // Natively handles state

    // simulate click again
    check.click();
    expect(check.getAttribute('aria-label')).toBe('image.jpg'); // Static
    expect(check.title).toBe('Select image.jpg');               // Dynamic future action
    expect(check.getAttribute('aria-checked')).toBe('false');   // Natively handles state
  });
});
