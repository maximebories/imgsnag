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
    getMessage: (key, arr) => {
      if (key === 'popupShortcutAlt') return 'Alt';
      if (key === 'popupShortcutOpt') return 'Option';
      if (key === 'popupEmptyHint' && arr) return 'Tip: ' + arr[0] + '+Click or drag images to save directly';
      return key;
    }
  },
  runtime: { sendMessage: jest.fn().mockResolvedValue() },
  tabs: { query: jest.fn().mockResolvedValue([]), connect: jest.fn() }
};

describe('Popup empty hint modifier', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('uses Alt on Windows/Linux', () => {
    Object.defineProperty(navigator, 'platform', { value: 'Win32', configurable: true });

    // Require popup.js to run its initial DOMContentLoaded logic (which we manually trigger or it runs directly)
    // Actually popup.js runs its initial setup synchronously during load
    require('../src/popup.js');

    expect(document.getElementById('empty-hint').textContent).toContain('Alt');
  });

  it('uses Option on Mac', () => {
    Object.defineProperty(navigator, 'platform', { value: 'MacIntel', configurable: true });

    require('../src/popup.js');

    expect(document.getElementById('empty-hint').textContent).toContain('Option');
  });
});
