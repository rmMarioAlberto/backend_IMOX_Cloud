import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { ResponseGetProfileDto } from './dto/user.dto';

describe('UserController', () => {
  let controller: UserController;
  let userService: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            register: jest.fn().mockResolvedValue(undefined),
            getProfile: jest.fn().mockResolvedValue({
              id: 1,
              name: 'Test',
              email: 'test@t.com',
              role: 1,
            } as ResponseGetProfileDto),
            deleteAccount: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('register', () => {
    it('should call userService.register and return success message', async () => {
      const res = await controller.register({
        name: 'Test',
        email: 'test@test.com',
        password: '123',
      });
      expect(userService.register).toHaveBeenCalled();
      expect(res.message).toBe('Usuario registrado exitosamente');
    });
  });

  describe('getProfile', () => {
    it('should return mapped profile data', async () => {
      const res = await controller.getProfile({ id: 1 } as any);
      expect(userService.getProfile).toHaveBeenCalled();
      expect(res.name).toBe('Test');
    });
  });

  describe('deleteAccount', () => {
    it('should call userService.deleteAccount and return message', async () => {
      const res = await controller.deleteAccount({ id: 1 } as any);
      expect(userService.deleteAccount).toHaveBeenCalledWith(1);
      expect(res.message).toBe('Cuenta eliminada exitosamente');
    });
  });
});
