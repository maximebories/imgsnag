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
