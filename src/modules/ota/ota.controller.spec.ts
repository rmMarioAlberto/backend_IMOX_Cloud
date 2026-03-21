import { Test, TestingModule } from '@nestjs/testing';
import { OtaController } from './ota.controller';
import { OtaService } from './ota.service';
import { CreateOtaDto } from './dto/create-ota.dto';
import { HttpException } from '@nestjs/common';

describe('OtaController', () => {
  let controller: OtaController;
  let service: OtaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OtaController],
      providers: [
        {
          provide: OtaService,
          useValue: {
            createOtaUpdate: jest.fn().mockResolvedValue({ message: 'ok', total: 1 }),
            getOtaHistory: jest.fn().mockResolvedValue([]),
            uploadFirmware: jest.fn().mockResolvedValue({ url: 'test-url', hash: 'test-hash' }),
            getAvailableFiles: jest.fn().mockResolvedValue([]),
            getLatestUpdate: jest.fn().mockResolvedValue({ version: 'v1' }),
          },
        },
      ],
    }).compile();

    controller = module.get<OtaController>(OtaController);
    service = module.get<OtaService>(OtaService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createOtaUpdate', () => {
    const dto: CreateOtaDto = {
      version: 'v1',
      url: 'url',
      target: [1],
    };

    it('should call service createOtaUpdate', async () => {
      const result = await controller.createOtaUpdate(dto);
      expect(service.createOtaUpdate).toHaveBeenCalledWith(dto);
      expect(result.total).toBe(1);
    });

    it('should throw HttpException if target is missing', async () => {
      const invalidDto = { ...dto, target: undefined as any };
      await expect(controller.createOtaUpdate(invalidDto)).rejects.toThrow(HttpException);
    });
  });

  describe('uploadFirmware', () => {
    it('should call service uploadFirmware', async () => {
      const mockFile = { originalname: 'test.bin' } as any;
      const result = await controller.uploadFirmware(mockFile);
      expect(service.uploadFirmware).toHaveBeenCalledWith(mockFile);
      expect(result.url).toBe('test-url');
    });

    it('should throw if file is missing', async () => {
      await expect(controller.uploadFirmware(undefined as any)).rejects.toThrow(HttpException);
    });
  });

  describe('getHistory', () => {
    it('should call service getOtaHistory with deviceId', async () => {
      await controller.getHistory(10);
      expect(service.getOtaHistory).toHaveBeenCalledWith(10);
    });

    it('should call service getOtaHistory without id', async () => {
      await controller.getHistory();
      expect(service.getOtaHistory).toHaveBeenCalledWith(undefined);
    });
  });

  describe('getAvailableFiles', () => {
    it('should call service getAvailableFiles', async () => {
      await controller.getAvailableFiles();
      expect(service.getAvailableFiles).toHaveBeenCalled();
    });
  });

  describe('getLatestUpdate', () => {
    it('should call service getLatestUpdate with deviceId number', async () => {
      await controller.getLatestUpdate(123);
      expect(service.getLatestUpdate).toHaveBeenCalledWith(123);
    });

    it('should call service getLatestUpdate without deviceId', async () => {
      await controller.getLatestUpdate();
      expect(service.getLatestUpdate).toHaveBeenCalledWith(undefined);
    });
  });
});
