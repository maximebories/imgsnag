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

describe('Popup Plural Rules', () => {
  let mockGetUILanguage;
  let mockGetMessage;

  beforeEach(() => {
    jest.resetModules();

    mockGetUILanguage = jest.fn().mockReturnValue('en');
    mockGetMessage = jest.fn((k, arr) => arr ? `${arr[0]}-${k}` : k);

    global.browser = {
      i18n: {
        getUILanguage: mockGetUILanguage,
        getMessage: mockGetMessage
      },
      runtime: { sendMessage: jest.fn().mockResolvedValue() },
      tabs: { query: jest.fn().mockResolvedValue([]), connect: jest.fn() }
    };

    Object.defineProperty(navigator, 'platform', {
      value: 'Win32',
      configurable: true
    });
  });

  const testPlural = (locale, selectedCount, expectedKey) => {
    mockGetUILanguage.mockReturnValue(locale);

    const { updateCounter, allUrls, selectedUrls } = require('../src/popup.js');
    allUrls.clear();
    selectedUrls.clear();

    // Add all dummy URLs
    for (let i = 0; i < Math.max(2, selectedCount); i++) {
        allUrls.add(`http://test.com/${i}`);
    }

    // Add selected dummy URLs
    for (let i = 0; i < selectedCount; i++) {
        selectedUrls.add(`http://test.com/${i}`);
    }

    updateCounter();

    const counterEl = document.getElementById('counter');
    if (selectedCount === 0) {
        expect(counterEl.textContent).toBe('');
    } else {
        expect(mockGetMessage).toHaveBeenCalledWith(expectedKey, [selectedCount.toString()]);
        expect(counterEl.textContent).toBe(`${selectedCount}-${expectedKey}`);
    }
  };

  it('selects plural forms correctly for English (en)', () => {
    testPlural('en', 0, ''); // Doesn't call getMessage for popupSelected
    testPlural('en', 1, 'popupSelectedOne');
    testPlural('en', 2, 'popupSelectedOther');
  });

  it('selects plural forms correctly for Spanish (es)', () => {
    testPlural('es', 0, '');
    testPlural('es', 1, 'popupSelectedOne');
    testPlural('es', 2, 'popupSelectedOther');
  });

  it('selects plural forms correctly for French (fr)', () => {
    testPlural('fr', 0, '');
    testPlural('fr', 1, 'popupSelectedOne');
    testPlural('fr', 2, 'popupSelectedOther');
  });
});

// The mocked getMessage above answers every key, so it cannot catch the failure
// that sank PR #299: popup.js asking for a plural key no locale file defines.
// getMessage returns '' for a missing key — no throw, no warning, a blank label.
// These assertions read the real message files instead.
describe('Plural key contract against the real locale files', () => {
  const locales = {
    en: require('../_locales/en/messages.json'),
    es: require('../_locales/es/messages.json'),
    fr: require('../_locales/fr/messages.json')
  };

  const pluralKeys = [
    'popupSelectedOne', 'popupSelectedOther',
    'popupHiddenCountOne', 'popupHiddenCountOther'
  ];

  it.each(Object.keys(locales))('%s defines every plural form popup.js can ask for', (loc) => {
    for (const key of pluralKeys) {
      expect(locales[loc][key]).toBeDefined();
      expect(locales[loc][key].message).toContain('$COUNT$');
      expect(locales[loc][key].placeholders.count.content).toBe('$1');
    }
  });

  it('keeps the key sets identical across locales', () => {
    expect(Object.keys(locales.es).sort()).toEqual(Object.keys(locales.en).sort());
    expect(Object.keys(locales.fr).sort()).toEqual(Object.keys(locales.en).sort());
  });
});
