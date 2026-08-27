/**
 * @jest-environment jsdom
 */

describe('Content script trust boundaries (e.isTrusted)', () => {
  let listeners = {};
  let originalAddEventListener;

  beforeEach(() => {
    jest.resetModules();

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

    listeners = {};
    originalAddEventListener = document.addEventListener;
    jest.spyOn(document, 'addEventListener').mockImplementation((event, cb) => {
      listeners[event] = cb;
    });

    // Mock elementsFromPoint for the click handler
    document.elementsFromPoint = jest.fn().mockReturnValue([]);

    // Require content script to run its IIFE and register listeners
    require('../src/content.js');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('rejects untrusted click events (synthetic alt+click)', () => {
    expect(listeners.click).toBeDefined();

    // Dispatch untrusted click
    listeners.click({
      isTrusted: false,
      altKey: true,
      clientX: 10,
      clientY: 10
    });

    // elementsFromPoint should NOT be called
    expect(document.elementsFromPoint).not.toHaveBeenCalled();

    // Dispatch trusted click
    listeners.click({
      isTrusted: true,
      altKey: true,
      clientX: 10,
      clientY: 10,
      preventDefault: jest.fn(),
      stopPropagation: jest.fn()
    });

    // elementsFromPoint SHOULD be called
    expect(document.elementsFromPoint).toHaveBeenCalled();
  });

  it('rejects untrusted dragend events (synthetic drag-to-save)', () => {
    expect(listeners.dragend).toBeDefined();

    // Dispatch untrusted dragend
    listeners.dragend({
      isTrusted: false,
      target: {
        tagName: 'IMG',
        src: 'https://example.com/image.jpg',
        hasAttribute: () => false,
        getAttribute: () => null
      }
    });

    // sendMessage should NOT be called
    expect(global.browser.runtime.sendMessage).not.toHaveBeenCalled();

    // Dispatch trusted dragend
    listeners.dragend({
      isTrusted: true,
      target: {
        tagName: 'IMG',
        src: 'https://example.com/image.jpg',
        hasAttribute: () => false,
        getAttribute: () => null
      }
    });

    // sendMessage SHOULD be called
    expect(global.browser.runtime.sendMessage).toHaveBeenCalledWith({
      action: 'download_image',
      url: 'https://example.com/image.jpg'
    });
  });
});
