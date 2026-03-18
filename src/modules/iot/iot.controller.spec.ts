import { Test, TestingModule } from '@nestjs/testing';
import { IotController } from './iot.controller';
import { IotService } from './iot.service';
import { ResponseIotDto } from './dto/iot.dto';

describe('IotController', () => {
  let controller: IotController;
  let service: IotService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IotController],
      providers: [
        {
          provide: IotService,
          useValue: {
            createIot: jest.fn().mockResolvedValue({ id: 1 } as ResponseIotDto),
            linkIotUser: jest.fn().mockResolvedValue(undefined),
            getIotsByUser: jest.fn().mockResolvedValue({ devices: [] }),
            getDeviceHistory: jest.fn().mockResolvedValue({ columns: [], data: [] }),
          },
        },
      ],
    }).compile();

    controller = module.get<IotController>(IotController);
    service = module.get<IotService>(IotService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('createIot should call and map correctly', async () => {
    expect(await controller.createIot({ macAddress: 'AA' })).toBeDefined();
    expect(service.createIot).toHaveBeenCalled();
  });

  it('linkUserIot should return success message', async () => {
    const res = await controller.linkUserIot({ macAddress: 'AA', deviceSecret: 'S', userId: 1 });
    expect(res.message).toBe('Dispositivo vinculado correctamente');
  });

  it('getIots should return list DTO', async () => {
    const res = await controller.getIots({ id: 1 } as any);
    expect(res.devices).toEqual([]);
  });

  it('getHistory should return data payload for frontend consumption', async () => {
    const res = await controller.getHistory({} as any, { id: 1 } as any);
    expect(res.data).toEqual([]);
  });
});
