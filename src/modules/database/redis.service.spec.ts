import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

jest.mock('redis', () => ({
  createClient: jest.fn().mockReturnValue({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('redis://localhost:6379'),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should initialize and connect the redis client', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(configService.get).toHaveBeenCalledWith('REDIS_URL');
      expect(service.getClient()).toBeDefined();
    });

    it('should throw error if REDIS_URL is not defined', async () => {
      jest.spyOn(configService, 'get').mockReturnValue(undefined);
      await expect(service.onModuleInit()).rejects.toThrow('REDIS_URL environment variable is not defined');
    });
  });

  describe('Redis Callbacks and Reconnect Strategy', () => {
    it('should test reconnectStrategy logic', async () => {
      const createClientMock = require('redis').createClient;
      await service.onModuleInit();
      const options = createClientMock.mock.calls[createClientMock.mock.calls.length - 1][0];
      const strategy = options.socket.reconnectStrategy;
      
      expect(strategy(11)).toBeInstanceOf(Error);
      expect(strategy(5)).toBe(500);
    });

    it('should trigger on callbacks', async () => {
      await service.onModuleInit();
      const clientMock = service.getClient() as any;
      const onCalls = clientMock.on.mock.calls;
      
      const errorCb = onCalls.find((c: any) => c[0] === 'error')[1];
      const connectCb = onCalls.find((c: any) => c[0] === 'connect')[1];
      const readyCb = onCalls.find((c: any) => c[0] === 'ready')[1];

      expect(() => errorCb(new Error('test error'))).not.toThrow();
      expect(() => connectCb()).not.toThrow();
      expect(() => readyCb()).not.toThrow();
    });
  });

  describe('onModuleDestroy', () => {
    it('should quit the redis client', async () => {
      await service.onModuleInit(); // Inicializa para tener el cliente presente
      const client = service.getClient();
      
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
      expect(client.quit).toHaveBeenCalled();
    });
  });
});
