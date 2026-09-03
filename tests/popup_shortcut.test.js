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
      <button id="btn-selected"></button>
      <button id="btn-all"></button>
    </div>
  </div>
`;

global.browser = {
  i18n: { getUILanguage: () => 'en', getMessage: (k, arr) => arr ? arr.join(',') : k },
  runtime: { sendMessage: jest.fn().mockResolvedValue() },
  tabs: { query: jest.fn().mockResolvedValue([]), connect: jest.fn() }
};

describe('Popup UI updates', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('binds shortcut hint only to the button the shortcut fires', () => {
    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      configurable: true
    });

    // We export updateCounter for testing
    const { updateCounter, allUrls, selectedUrls } = require('../src/popup.js');
    allUrls.add('1');
    allUrls.add('2');
    updateCounter();

    const btnSelected = document.getElementById('btn-selected');
    const btnAll = document.getElementById('btn-all');

    expect(btnSelected.title).toBe('');
    expect(btnAll.title).toContain('Ctrl');

    selectedUrls.add('1');
    updateCounter();

    expect(btnSelected.title).toContain('Ctrl');
    expect(btnAll.title).toBe('');
  });
});
