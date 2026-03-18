export const mockInfluxWriteApi = {
  writePoint: jest.fn(),
  flush: jest.fn(),
  close: jest.fn(),
};

export const mockInfluxQueryApi = {
  queryRows: jest.fn(),
};

export const mockInfluxDbService = {
  getWriteApi: jest.fn().mockReturnValue(mockInfluxWriteApi),
  getQueryApi: jest.fn().mockReturnValue(mockInfluxQueryApi),
  getBucket: jest.fn().mockReturnValue('test-bucket'),
  deleteData: jest.fn(),
};
