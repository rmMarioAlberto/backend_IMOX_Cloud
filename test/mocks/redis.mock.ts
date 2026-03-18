export const mockRedisClient = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  lPush: jest.fn(),
  lTrim: jest.fn(),
  lRange: jest.fn(),
  keys: jest.fn(),
  incr: jest.fn(),
  expire: jest.fn(),
  setEx: jest.fn(),
  connect: jest.fn(),
  isOpen: true,
  ping: jest.fn(),
  on: jest.fn(),
};

export const mockRedisService = {
  getClient: jest.fn().mockReturnValue(mockRedisClient),
  get: jest.fn(),
  set: jest.fn(),
  setEx: jest.fn(),
  del: jest.fn(),
};
