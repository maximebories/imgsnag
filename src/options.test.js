/**
 * @jest-environment jsdom
 */

describe('Options Page', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div>
        <label>
          <input type="checkbox" id="disable_drag" />
          <span id="disable_drag_label"></span>
        </label>
      </div>
      <div id="status"></div>
      <div>
        <button id="save"></button>
      </div>
    `;

    global.browser = {
      i18n: {
        getMessage: jest.fn((key) => {
          const messages = {
            disableDragLabel: 'Disable Drag to Save',
            optionsSave: 'Save',
            optionsStatus: 'Options saved.',
          };
          return messages[key];
        }),
      },
      storage: {
        sync: {
          get: jest.fn().mockResolvedValue({ disableDrag: true }),
          set: jest.fn().mockResolvedValue(),
        },
      },
    };

    jest.useFakeTimers();

    jest.isolateModules(() => {
      require('./options');
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    delete global.browser;
  });

  test('restores options and localization on DOMContentLoaded', async () => {
    document.dispatchEvent(new Event('DOMContentLoaded'));

    expect(global.browser.i18n.getMessage).toHaveBeenCalledWith('disableDragLabel');
    expect(global.browser.i18n.getMessage).toHaveBeenCalledWith('optionsSave');
    expect(document.getElementById('disable_drag_label').textContent).toBe('Disable Drag to Save');
    expect(document.getElementById('save').textContent).toBe('Save');

    expect(global.browser.storage.sync.get).toHaveBeenCalledWith({ disableDrag: false });

    await Promise.resolve(); // flush promises

    expect(document.getElementById('disable_drag').checked).toBe(true);
  });

  test('saves options and shows/hides status message on save click', async () => {
    document.getElementById('disable_drag').checked = false;

    document.getElementById('save').dispatchEvent(new Event('click'));

    expect(global.browser.storage.sync.set).toHaveBeenCalledWith({ disableDrag: false });

    await Promise.resolve(); // flush promises

    const status = document.getElementById('status');
    expect(global.browser.i18n.getMessage).toHaveBeenCalledWith('optionsStatus');
    expect(status.textContent).toBe('Options saved.');

    jest.advanceTimersByTime(3000);

    expect(status.textContent).toBe('');
  });
});
