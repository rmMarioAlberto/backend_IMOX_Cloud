import { Test, TestingModule } from '@nestjs/testing';
import { OtaService } from './ota.service';
import { MariaDbService } from '../database/mariadb.service';
import { MqttService } from '../mqtt/mqtt.service';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('OtaService', () => {
  let service: OtaService;
  let mariaDbService: MariaDbService;
  let mqttService: MqttService;

  beforeEach(async () => {
    jest.clearAllMocks();
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
              findFirst: jest.fn(),
            },
          },
        },
        {
          provide: MqttService,
          useValue: {
            publishOtaCommand: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'OTA_BASE_URL') return 'https://dietpi.tail02564c.ts.net';
              return null;
            }),
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

    it('should throw BadRequestException if local firmware file does not exist', async () => {
      const localDto = {
        ...dto,
        url: 'https://dietpi.tail02564c.ts.net/ota/downloads/missing.bin',
      };
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(service.createOtaUpdate(localDto)).rejects.toThrow(
        'El archivo de firmware especificado no existe en el servidor: missing.bin',
      );
    });

    it('should throw BadRequestException if local firmware hash does not match', async () => {
      const localDto = {
        ...dto,
        url: 'https://dietpi.tail02564c.ts.net/ota/downloads/valid.bin',
        hash: 'wrong-hash',
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('correct-content'));
      // El hash de 'correct-content' no será 'wrong-hash'

      await expect(service.createOtaUpdate(localDto)).rejects.toThrow('El hash proporcionado no coincide');
    });

    it('should skip local validation for external URLs', async () => {
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue([{ id: 1 }]);
      const externalDto = {
        ...dto,
        url: 'https://external-firmware.com/image.bin',
      };
      await service.createOtaUpdate(externalDto);
      expect(fs.existsSync).not.toHaveBeenCalled();
    });

    it('should skip hash check if providedHash is not present', async () => {
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue([{ id: 1 }]);
      const localDto = {
        ...dto,
        url: 'https://dietpi.tail02564c.ts.net/ota/downloads/valid.bin',
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      await service.createOtaUpdate(localDto);
      expect(fs.readFileSync).not.toHaveBeenCalled();
    });

    it('should pass if local firmware hash matches', async () => {
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue([{ id: 1 }]);
      const content = 'correct-content';
      const hash = createHash('sha256').update(content).digest('hex');
      const localDto = {
        ...dto,
        url: 'https://dietpi.tail02564c.ts.net/ota/downloads/valid.bin',
        hash: hash,
      };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from(content));

      await service.createOtaUpdate(localDto);
      expect(mqttService.publishOtaCommand).toHaveBeenCalled();
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

  describe('uploadFirmware', () => {
    const mockFile = {
      originalname: 'test.bin',
      buffer: Buffer.from('test-content'),
    } as any;

    it('should save file and return hash and url', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      
      const result = await service.uploadFirmware(mockFile);

      expect(fs.mkdirSync).toHaveBeenCalled();
      expect(fs.writeFileSync).toHaveBeenCalled();
      expect(result.hash).toBeDefined();
      expect(result.url).toContain('https://dietpi.tail02564c.ts.net/ota/downloads/');
      expect(result.fileName).toContain('test.bin');
    });

    it('should not recreate directory if it exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      await service.uploadFirmware(mockFile);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should use default localhost URL if config is missing', async () => {
      (mariaDbService.ota_updates.findFirst as jest.Mock).mockResolvedValue({});
      (mariaDbService.iot.findMany as jest.Mock).mockResolvedValue([{ id: 1 }]);
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['firmware.bin']);
      (fs.statSync as jest.Mock).mockReturnValue({ size: 100, birthtime: new Date() });
      
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          OtaService,
          { provide: MariaDbService, useValue: mariaDbService },
          { provide: MqttService, useValue: mqttService },
          { provide: ConfigService, useValue: { get: jest.fn().mockReturnValue(null) } },
        ],
      }).compile();
      const localService = module.get<OtaService>(OtaService);
      
      const result = await localService.uploadFirmware(mockFile);
      expect(result.url).toContain('http://localhost:3000');

      const files = await localService.getAvailableFiles();
      if (files.length > 0) expect(files[0].url).toContain('http://localhost:3000');
    });
  });

  describe('getAvailableFiles', () => {
    it('should return empty array if directory does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      const result = await service.getAvailableFiles();
      expect(result).toEqual([]);
    });

    it('should return list of .bin files', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue(['firmware1.bin', 'readme.txt', 'firmware2.bin']);
      (fs.statSync as jest.Mock).mockReturnValue({
        size: 1024,
        birthtime: new Date(),
      });

      const result = await service.getAvailableFiles();

      expect(result).toHaveLength(2);
      expect(result[0].fileName).toBe('firmware1.bin');
      expect(result[0].url).toContain('firmware1.bin');
    });
  });

  describe('getLatestUpdate', () => {
    it('should call findFirst with correct parameters', async () => {
      const mockUpdate = { version: 'v1.0.1' };
      (mariaDbService.ota_updates.findFirst as jest.Mock) = jest.fn().mockResolvedValue(mockUpdate);

      const result = await service.getLatestUpdate(123);

      expect(mariaDbService.ota_updates.findFirst).toHaveBeenCalledWith({
        where: { device_id: 123 },
        orderBy: { created_at: 'desc' },
        select: expect.any(Object),
      });
      expect(result).toEqual(mockUpdate);
    });
  });
});
