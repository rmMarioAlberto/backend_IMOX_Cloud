import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from './user.service';
import { MariaDbService } from '../database/mariadb.service';
import { IotService } from '../iot/iot.service';
import { ConflictException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
}));

describe('UserService', () => {
  let service: UserService;
  let mariaDbService: MariaDbService;
  let iotService: IotService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: MariaDbService,
          useValue: {
            users: {
              findUnique: jest.fn(),
              create: jest.fn(),
              delete: jest.fn(),
            },
            iot: {
              findMany: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
              updateMany: jest.fn(),
            },
          },
        },
        {
          provide: IotService,
          useValue: {
            deleteTelemetryData: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    mariaDbService = module.get<MariaDbService>(MariaDbService);
    iotService = module.get<IotService>(IotService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValue(null);
      await service.register({ name: 'Test', email: 'test@test.com', password: 'pwd' });
      expect(mariaDbService.users.create).toHaveBeenCalled();
    });

    it('should throw ConflictException if user already exists', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      await expect(
        service.register({ name: 'Test', email: 'test@test.com', password: 'pwd' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValue({ id: 1, name: 'Test' });
      const result = await service.getProfile({ sub: 1 } as any);
      expect(result.name).toBe('Test');
    });

    it('should throw BadRequestException if user not found', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.getProfile({ sub: 1 } as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('deleteAccount', () => {
    it('should delete user and decouple devices successfully', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValue({ id: 1 });
      await service.deleteAccount(1);

      expect(iotService.deleteTelemetryData).toHaveBeenCalledTimes(2);
      expect(mariaDbService.iot.updateMany).toHaveBeenCalledWith({
        where: { user_id: 1 },
        data: { user_id: null },
      });
      expect(mariaDbService.users.delete).toHaveBeenCalledWith({ where: { id: 1 } });
    });

    it('should throw if user not found to delete', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(service.deleteAccount(1)).rejects.toThrow(BadRequestException);
    });
  });
});
