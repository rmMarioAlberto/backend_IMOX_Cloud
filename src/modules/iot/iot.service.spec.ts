import { Test, TestingModule } from '@nestjs/testing';
import { IotService } from './iot.service';
import { MariaDbService } from '../database/mariadb.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-secret'),
  compare: jest.fn(),
}));

describe('IotService', () => {
  let service: IotService;
  let mariaDbService: MariaDbService;
  let telemetryInflux: TelemetryInfluxService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IotService,
        {
          provide: MariaDbService,
          useValue: {
            iot: {
              findUnique: jest.fn(),
              create: jest.fn().mockImplementation((args) => Promise.resolve({ id: 1, ...args.data })),
              update: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: TelemetryInfluxService,
          useValue: {
            deleteTelemetryByIotId: jest.fn(),
            queryAggregatedTelemetry: jest.fn().mockResolvedValue([]),
            queryAnomaliesRange: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    service = module.get<IotService>(IotService);
    mariaDbService = module.get<MariaDbService>(MariaDbService);
    telemetryInflux = module.get<TelemetryInfluxService>(TelemetryInfluxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createIot', () => {
    it('should create a new device and return unhashed secret', async () => {
      (mariaDbService.iot.findUnique as jest.Mock).mockResolvedValue(null);
      const res = await service.createIot({ macAddress: 'AA:BB' });

      expect(res.macAddress).toBe('AA:BB');
      expect(res.deviceSecret).toBeDefined(); // Plain text secret as per dtos
      expect(mariaDbService.iot.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if device exists', async () => {
      (mariaDbService.iot.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      await expect(service.createIot({ macAddress: 'AA:BB' })).rejects.toThrow(BadRequestException);
    });
  });

  describe('linkIotUser', () => {
    it('should link user if credentials are valid and clear old telemetry if reassigned', async () => {
      (mariaDbService.iot.findUnique as jest.Mock).mockResolvedValue({ id: 1, status: 1, device_secret: 'hashed', user_id: 2 });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(service.linkIotUser({ macAddress: 'AA:BB', deviceSecret: 'plain', userId: 1 })).resolves.not.toThrow();
      
      // Debe borrar telemetria si era distinto al de antes (era 2, pasa a 1)
      expect(telemetryInflux.deleteTelemetryByIotId).toHaveBeenCalledWith(1); 
      expect(mariaDbService.iot.update).toHaveBeenCalledWith({ where: { mac_address: 'AA:BB' }, data: { user_id: 1 } });
    });

    it('should throw if device is inactive or not found', async () => {
      (mariaDbService.iot.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.linkIotUser({ macAddress: 'AA:BB', deviceSecret: 'plain', userId: 1 })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getIotsByUser', () => {
    it('should retrieve list mapping correctly via class-transformer', async () => {
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue([{ id: 1, mac_address: 'AA' }]);
      const result = await service.getIotsByUser({ id: 1 } as any);
      expect(result.devices.length).toBe(1);
    });
  });

  describe('getDeviceHistory', () => {
    it('should throw if device not found', async () => {
      (mariaDbService.iot.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.getDeviceHistory({ iotId: 1, startDate: '2023', endDate: '2024' }, { id: 1 } as any)
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw Conflict if device belongs to other user', async () => {
      (mariaDbService.iot.findUnique as jest.Mock).mockResolvedValue({ id: 1, user_id: 2 });
      await expect(
        service.getDeviceHistory({ iotId: 1, startDate: '2023', endDate: '2024' }, { id: 1 } as any)
      ).rejects.toThrow(ConflictException);
    });

    it('should query and return combined history smoothing algorithm', async () => {
      (mariaDbService.iot.findUnique as jest.Mock).mockResolvedValue({ id: 1, user_id: 1 });
      (telemetryInflux.queryAggregatedTelemetry as jest.Mock).mockResolvedValue([{ _time: '2023-01-01', voltaje_v: 110 }]);
      (telemetryInflux.queryAnomaliesRange as jest.Mock).mockResolvedValue([{ _time: '2023-01-02', voltaje_v: 150, anomaly_type: 'SPIKE' }]);

      const history = await service.getDeviceHistory(
        { iotId: 1, startDate: '2023-01-01T00:00:00.000Z', endDate: '2023-01-03T00:00:00.000Z' },
        { id: 1 } as any
      );
      
      // Mínimo de puntos dependiendo del algoritmo deadband, anomalías siempre pasan.
      expect(history.data.length).toBeGreaterThan(0);
    });

    it('should catch errors and return empty data in getDeviceHistory', async () => {
      (mariaDbService.iot.findUnique as jest.Mock).mockResolvedValue({ id: 1, user_id: 1 });
      (telemetryInflux.queryAggregatedTelemetry as jest.Mock).mockRejectedValueOnce(new Error('Influx fail'));
      const history = await service.getDeviceHistory(
        { iotId: 1, startDate: '2023-01-01T00:00:00.000Z', endDate: '2023-01-03T00:00:00.000Z' },
        { id: 1 } as any
      );
      expect(history.data).toEqual([]);
    });
  });

  describe('deleteTelemetryData', () => {
    it('should call delete on influx correctly', async () => {
      await service.deleteTelemetryData(1);
      expect(telemetryInflux.deleteTelemetryByIotId).toHaveBeenCalledWith(1);
    });

    it('should catch errors silently in deleteTelemetryData', async () => {
      (telemetryInflux.deleteTelemetryByIotId as jest.Mock).mockRejectedValueOnce(new Error('Influx fail'));
      await expect(service.deleteTelemetryData(1)).resolves.not.toThrow();
    });
  });
});
