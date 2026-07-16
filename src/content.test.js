// Mock the browser global object before requiring the content script
global.browser = {
  runtime: {
    onConnect: {
      addListener: jest.fn(),
    },
    sendMessage: jest.fn(() => Promise.resolve()),
  },
  storage: {
    sync: {
      get: jest.fn(() => Promise.resolve({ disableDrag: false })),
    },
    onChanged: {
      addListener: jest.fn(),
    },
  },
};

// Require the content script which executes the IIFE
const { isVideoUrl } = require('./content');

describe('isVideoUrl', () => {
  describe('valid video URLs', () => {
    const videoExtensions = ['mp4', 'webm', 'ogv', 'mov', 'm4v', 'avi'];

    videoExtensions.forEach((ext) => {
      it(`should return true for a valid .${ext} URL`, () => {
        expect(isVideoUrl(`https://example.com/video.${ext}`)).toBe(true);
      });

      it(`should return true for a valid .${ext} URL with query parameters`, () => {
        expect(isVideoUrl(`https://example.com/video.${ext}?v=123&autoplay=1`)).toBe(true);
      });

      it(`should return true for a valid .${ext} URL with hash fragments`, () => {
        expect(isVideoUrl(`https://example.com/video.${ext}#time=10`)).toBe(true);
      });

      it(`should return true for a valid uppercase .${ext.toUpperCase()} URL`, () => {
        expect(isVideoUrl(`https://example.com/video.${ext.toUpperCase()}`)).toBe(true);
      });

      it(`should return true for a valid URL with mixed case .${ext.charAt(0).toUpperCase() + ext.slice(1)}`, () => {
        const mixedCaseExt = ext.charAt(0).toUpperCase() + ext.slice(1);
        expect(isVideoUrl(`https://example.com/video.${mixedCaseExt}`)).toBe(true);
      });
    });
  });

  describe('invalid or non-video URLs', () => {
    it('should return false for image URLs', () => {
      expect(isVideoUrl('https://example.com/image.jpg')).toBe(false);
      expect(isVideoUrl('https://example.com/image.png')).toBe(false);
      expect(isVideoUrl('https://example.com/image.gif')).toBe(false);
    });

    it('should return false for web page URLs', () => {
      expect(isVideoUrl('https://example.com/page.html')).toBe(false);
      expect(isVideoUrl('https://example.com/')).toBe(false);
    });

    it('should return false for URLs with video extensions elsewhere in the path', () => {
      // The extension should be at the end of the pathname
      expect(isVideoUrl('https://example.com/video.mp4/page.html')).toBe(false);
    });

    it('should return false for URLs where extension is part of a longer extension', () => {
      expect(isVideoUrl('https://example.com/video.mp4xyz')).toBe(false);
    });

    it('should return false for malformed URLs that cannot be parsed', () => {
      expect(isVideoUrl('not_a_valid_url')).toBe(false);
    });

    it('should return false for completely unrelated domains with no path', () => {
       expect(isVideoUrl('https://mp4.example.com')).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should return false for null', () => {
      expect(isVideoUrl(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isVideoUrl(undefined)).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isVideoUrl('')).toBe(false);
    });
  });
});
