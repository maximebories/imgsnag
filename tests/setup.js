global.browser = {
  i18n: {
    getUILanguage: jest.fn().mockReturnValue('en')
  },
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
