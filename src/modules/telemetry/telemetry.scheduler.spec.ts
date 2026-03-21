import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryScheduler } from './telemetry.scheduler';
import { TelemetryRedisService } from '../database/telemetry/telemetry-redis.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { MariaDbService } from '../database/mariadb.service';
import { ConfigService } from '@nestjs/config';

describe('TelemetryScheduler', () => {
  let scheduler: TelemetryScheduler;
  let redisService: TelemetryRedisService;
  let influxService: TelemetryInfluxService;
  let mariaDb: MariaDbService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryScheduler,
        {
          provide: TelemetryRedisService,
          useValue: {
            keys: jest.fn().mockResolvedValue(['iot:1:last']),
            getTelemetryLast: jest.fn().mockResolvedValue({ electricas: { voltaje_v: 120 } }),
            getCriticalEvents: jest.fn().mockResolvedValue([]),
            clearCriticalEvents: jest.fn(),
          },
        },
        {
          provide: TelemetryInfluxService,
          useValue: {
            writeTelemetryPoint: jest.fn(),
          },
        },
        {
          provide: MariaDbService,
          useValue: {
            iot: {
              findUnique: jest.fn().mockResolvedValue({ user_id: 1 }),
              update: jest.fn(),
            },
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('10') },
        },
      ],
    }).compile();

    scheduler = module.get<TelemetryScheduler>(TelemetryScheduler);
    redisService = module.get<TelemetryRedisService>(TelemetryRedisService);
    influxService = module.get<TelemetryInfluxService>(TelemetryInfluxService);
    mariaDb = module.get<MariaDbService>(MariaDbService);
  });

  describe('persistAllDevices', () => {
    it('should iterate device keys and save data to influx', async () => {
      await scheduler.persistAllDevices();
      expect(redisService.keys).toHaveBeenCalled();
      expect(influxService.writeTelemetryPoint).toHaveBeenCalled();
      expect(redisService.clearCriticalEvents).toHaveBeenCalledWith(1);
    });

    it('should catch error in persistAllDevices gracefully', async () => {
      (influxService.writeTelemetryPoint as jest.Mock).mockRejectedValueOnce(new Error('Influx error'));
      await expect(scheduler.persistAllDevices()).resolves.not.toThrow();
    });

    it('should skip device if no user_id is assigned', async () => {
      (mariaDb.iot.findUnique as jest.Mock).mockResolvedValueOnce({ user_id: null });
      await scheduler.persistAllDevices();
      expect(influxService.writeTelemetryPoint).not.toHaveBeenCalled();
    });

    it('should process critical events even if lastReading is null', async () => {
      (redisService.getTelemetryLast as jest.Mock).mockResolvedValueOnce(null);
      (redisService.getCriticalEvents as jest.Mock).mockResolvedValueOnce([{
        anomaly_type: 'SPIKE',
        electricas: { voltaje_v: 150 },
        timestamp: new Date().toISOString()
      }]);
      
      await scheduler.persistAllDevices();
      expect(influxService.writeTelemetryPoint).toHaveBeenCalledWith(1, expect.objectContaining({
        anomaly_type: 'SPIKE'
      }));
    });

    it('should handle critical events with missing data', async () => {
       (redisService.getCriticalEvents as jest.Mock).mockResolvedValueOnce([{
         anomaly_type: 'SPIKE',
         timestamp: new Date().toISOString()
       }]);
       await scheduler.persistAllDevices();
       expect(influxService.writeTelemetryPoint).toHaveBeenCalled();
    });

    it('should return early if both lastReading and criticalEvents are empty', async () => {
      (redisService.getTelemetryLast as jest.Mock).mockResolvedValueOnce(null);
      (redisService.getCriticalEvents as jest.Mock).mockResolvedValueOnce([]);
      await scheduler.persistAllDevices();
      expect(mariaDb.iot.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('checkDeviceHealth', () => {
    it('should mark device offline if timeout exceeded', async () => {
      // Configuramos la lectura para simular que ocurrió hace decadas
      (redisService.getTelemetryLast as jest.Mock).mockResolvedValue({ timestamp: new Date('2020-01-01').toISOString() });
      await scheduler.checkDeviceHealth();
      
      expect(mariaDb.iot.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { is_online: false }
      });
    });

    it('should DO NOTHING if time is recent', async () => {
      (redisService.getTelemetryLast as jest.Mock).mockResolvedValue({ timestamp: new Date().toISOString() });
      await scheduler.checkDeviceHealth();
      
      expect(mariaDb.iot.update).not.toHaveBeenCalled();
    });

    it('should catch error in checkDeviceHealth gracefully', async () => {
      (mariaDb.iot.update as jest.Mock).mockRejectedValueOnce(new Error('DB Failed'));
      (redisService.getTelemetryLast as jest.Mock).mockResolvedValue({ timestamp: new Date('2020-01-01').toISOString() });
      await expect(scheduler.checkDeviceHealth()).resolves.not.toThrow();
    });

    it('should skip if lastData is null in checkDeviceHealth', async () => {
      (redisService.getTelemetryLast as jest.Mock).mockResolvedValueOnce(null);
      await scheduler.checkDeviceHealth();
      expect(mariaDb.iot.update).not.toHaveBeenCalled();
    });
  });
});
