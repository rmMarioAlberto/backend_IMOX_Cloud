import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryRedisService } from './telemetry-redis.service';
import { RedisService } from '../redis.service';
import { mockRedisService, mockRedisClient } from '../../../../test/mocks/redis.mock';

describe('TelemetryRedisService', () => {
  let service: TelemetryRedisService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryRedisService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<TelemetryRedisService>(TelemetryRedisService);
    mockRedisService.getClient.mockReturnValue(mockRedisClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getTelemetryLast / setTelemetryLast', () => {
    it('should save telemetry logic correctly', async () => {
      const data = { electricas: { voltaje_v: 120 } } as any;
      await service.setTelemetryLast(10, data, 600);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'iot:10:last',
        JSON.stringify(data),
        { EX: 600 }
      );
    });

    it('should get parsed telemetry data', async () => {
      const data = { electricas: { voltaje_v: 120 } };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(data));
      const res = await service.getTelemetryLast(10);
      expect(res).toEqual(data);
    });
  });

  describe('Critical Events', () => {
    it('should push critical event and trim', async () => {
      const data = { electricas: { voltaje_v: 120 } } as any;

      mockRedisClient.lPush = jest.fn();
      mockRedisClient.lTrim = jest.fn();
      mockRedisClient.expire = jest.fn();

      await service.pushCriticalEvent(10, data);
      expect(mockRedisClient.lPush).toHaveBeenCalledWith('iot:10:critical_buffer', JSON.stringify(data));
      expect(mockRedisClient.lTrim).toHaveBeenCalledWith('iot:10:critical_buffer', 0, 99);
      expect(mockRedisClient.expire).toHaveBeenCalledWith('iot:10:critical_buffer', 3600);
    });

    it('should get critical events', async () => {
      mockRedisClient.lRange = jest.fn().mockResolvedValueOnce(['{"voltaje_v": 120}']);
      const evs = await service.getCriticalEvents(10);
      expect(evs.length).toBe(1);
      expect(mockRedisClient.lRange).toHaveBeenCalledWith('iot:10:critical_buffer', 0, -1);
    });

    it('should clear critical events', async () => {
      mockRedisClient.del = jest.fn();
      await service.clearCriticalEvents(10);
      expect(mockRedisClient.del).toHaveBeenCalledWith('iot:10:critical_buffer');
    });
  });

  describe('Baseline & Utilities', () => {
    it('should set baseline', async () => {
      const data = { electricas: { voltaje_v: 120 } } as any;
      await service.setBaseline(10, data, 3600);
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'iot:10:baseline',
        JSON.stringify(data),
        { EX: 3600 }
      );
    });

    it('should get baseline', async () => {
      const data = { electricas: { voltaje_v: 120 } };
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify(data));
      const res = await service.getBaseline(10);
      expect(res).toEqual(data);
    });

    it('should return null if no baseline', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      const res = await service.getBaseline(10);
      expect(res).toBeNull();
    });

    it('should get keys by pattern', async () => {
      mockRedisClient.keys = jest.fn().mockResolvedValueOnce(['key1', 'key2']);
      const res = await service.keys('iot:*');
      expect(res.length).toBe(2);
      expect(mockRedisClient.keys).toHaveBeenCalledWith('iot:*');
    });
  });
});

