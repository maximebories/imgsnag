global.browser = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue(),
    onConnect: {
      addListener: jest.fn()
    }
  },
  storage: {
    sync: {
      get: jest.fn().mockResolvedValue({ disableDrag: false })
    },
    onChanged: {
      addListener: jest.fn()
    }
  }
};
global.browser = {
  runtime: {
    sendMessage: jest.fn().mockResolvedValue(),
    onConnect: {
      addListener: jest.fn()
    }
  },
  storage: {
    sync: {
      get: jest.fn().mockResolvedValue({ disableDrag: false })
    },
    onChanged: {
      addListener: jest.fn()
    }
  },
  i18n: {
    getUILanguage: jest.fn().mockReturnValue('en'),
    getMessage: jest.fn((key) => key)
  }
};
global.browser.i18n = {
  getUILanguage: jest.fn().mockReturnValue('en'),
  getMessage: jest.fn((key) => key)
};
