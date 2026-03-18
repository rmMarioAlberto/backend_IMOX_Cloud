import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InfluxDbService } from './influxdb.service';

const mockWriteApi = {
  useDefaultTags: jest.fn(),
  close: jest.fn().mockResolvedValue(true),
};

const mockQueryApi = {};

jest.mock('@influxdata/influxdb-client', () => {
  return {
    InfluxDB: jest.fn().mockImplementation(() => ({
      getWriteApi: jest.fn().mockReturnValue(mockWriteApi),
      getQueryApi: jest.fn().mockReturnValue(mockQueryApi),
    })),
  };
});

describe('InfluxDbService', () => {
  let service: InfluxDbService;
  let configService: ConfigService;

  beforeEach(async () => {
    // Reset global fetch mock
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        text: () => Promise.resolve('ok'),
      } as Response),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InfluxDbService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              const map = {
                INFLUXDB_URL: 'http://localhost:8086',
                INFLUXDB_TOKEN: 'some-token',
                INFLUXDB_ORG: 'my-org',
                INFLUXDB_BUCKET: 'my-bucket',
              };
              return map[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<InfluxDbService>(InfluxDbService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Constructor fallback', () => {
    it('should throw an error if environment variables are missing', () => {
      const badConfigService = { get: jest.fn().mockReturnValue(undefined) } as any;
      expect(() => new InfluxDbService(badConfigService)).toThrow(
        'InfluxDB environment variables are missing.'
      );
    });
  });

  describe('onModuleInit', () => {
    it('should initialize influxDB clients correctly', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(service.getWriteApi()).toBeDefined();
      expect(mockWriteApi.useDefaultTags).toHaveBeenCalledWith({ source: 'imox_backend' });
    });
  });

  describe('onModuleDestroy', () => {
    it('should close writeApi upon destruction', async () => {
      await service.onModuleInit();
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
      expect(mockWriteApi.close).toHaveBeenCalled();
    });

    it('should catch error if close fails upon destruction', async () => {
      await service.onModuleInit();
      mockWriteApi.close.mockRejectedValueOnce(new Error('Mock close error'));
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('Getters', () => {
    it('should return org and bucket correctly', () => {
      expect(service.getOrg()).toBe('my-org');
      expect(service.getBucket()).toBe('my-bucket');
    });
    
    it('should return query api correctly', async () => {
      await service.onModuleInit();
      expect(service.getQueryApi()).toBe(mockQueryApi);
    });
  });

  describe('deleteData', () => {
    it('should perform fetch correctly to delete data', async () => {
      await expect(service.deleteData('start', 'stop', 'predicate')).resolves.not.toThrow();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should throw error if fetch response is not ok', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          text: () => Promise.resolve('Invalid parameters'),
        } as Response),
      );

      await expect(service.deleteData('start', 'stop', 'predicate')).rejects.toThrow('InfluxDB delete failed');
    });
  });
});
