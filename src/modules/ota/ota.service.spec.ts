import { Test, TestingModule } from '@nestjs/testing';
import { OtaService } from './ota.service';
import { MariaDbService } from '../database/mariadb.service';
import { MqttService } from '../mqtt/mqtt.service';
import { BadRequestException } from '@nestjs/common';

describe('OtaService', () => {
  let service: OtaService;
  let mariaDbService: MariaDbService;
  let mqttService: MqttService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtaService,
        {
          provide: MariaDbService,
          useValue: {
            iot: {
              findMany: jest.fn(),
            },
            ota_updates: {
              create: jest.fn(),
              findMany: jest.fn(),
            },
          },
        },
        {
          provide: MqttService,
          useValue: {
            publishOtaCommand: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<OtaService>(OtaService);
    mariaDbService = module.get<MariaDbService>(MariaDbService);
    mqttService = module.get<MqttService>(MqttService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createOtaUpdate', () => {
    const dto = {
      version: 'v1.0.0',
      url: 'https://example.com/firmware.bin',
      target: [1] as number[],
    };

    it('should dispatch updates to specific devices', async () => {
      const devices = [{ id: 1, mac_address: '00:11:22' }];
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue(devices);
      (mariaDbService.ota_updates.create as jest.Mock).mockResolvedValue({ id: 101, status: 'PENDING' });

      const result = await service.createOtaUpdate(dto);

      expect(mariaDbService.iot.findMany).toHaveBeenCalledWith({
        where: { id: { in: [1] }, status: 1 },
        select: { id: true, mac_address: true },
      });
      expect(mariaDbService.ota_updates.create).toHaveBeenCalled();
      expect(mqttService.publishOtaCommand).toHaveBeenCalledWith(1, expect.any(Object));
      expect(result.total).toBe(1);
      expect(result.dispatched[0].deviceId).toBe(1);
    });

    it('should dispatch updates to ALL active devices', async () => {
      const devices = [
        { id: 1, mac_address: '00:11' },
        { id: 2, mac_address: '22:33' },
      ];
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue(devices);

      const result = await service.createOtaUpdate({ ...dto, target: 'ALL' });

      expect(mariaDbService.iot.findMany).toHaveBeenCalledWith({
        where: { status: 1 },
        select: { id: true, mac_address: true },
      });
      expect(mqttService.publishOtaCommand).toHaveBeenCalledTimes(2);
      expect(result.total).toBe(2);
    });

    it('should include hash in mqtt payload if provided', async () => {
      const devices = [{ id: 1, mac_address: '00:11' }];
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue(devices);

      await service.createOtaUpdate({ ...dto, hash: 'sha256-hash' });

      expect(mqttService.publishOtaCommand).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ hash: 'sha256-hash' }),
      );
    });

    it('should return 0 dispatched if no active devices found', async () => {
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.createOtaUpdate(dto);

      expect(result.total).toBe(0);
      expect(result.dispatched).toEqual([]);
      expect(mqttService.publishOtaCommand).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException if target array is empty', async () => {
      await expect(service.createOtaUpdate({ ...dto, target: [] })).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if target is not "ALL" and not an array', async () => {
      await expect(service.createOtaUpdate({ ...dto, target: 123 as any })).rejects.toThrow(BadRequestException);
    });
  });

  describe('getOtaHistory', () => {
    it('should call findMany without filters', async () => {
      await service.getOtaHistory();
      expect(mariaDbService.ota_updates.findMany).toHaveBeenCalledWith({
        where: {},
        orderBy: { created_at: 'desc' },
        select: expect.any(Object),
      });
    });

    it('should call findMany with deviceId filter', async () => {
      await service.getOtaHistory(5);
      expect(mariaDbService.ota_updates.findMany).toHaveBeenCalledWith({
        where: { device_id: 5 },
        orderBy: { created_at: 'desc' },
        select: expect.any(Object),
      });
    });
  });
});
