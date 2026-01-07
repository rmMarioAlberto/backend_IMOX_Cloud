import { Test, TestingModule } from '@nestjs/testing';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { RegisterUserDto } from './dto/user.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

// Mock del decorador GetUser
jest.mock('../../common/decorators/get-user.decorator', () => ({
  GetUser: () => () => ({}),
}));

const mockUserService = {
  register: jest.fn(),
  getProfile: jest.fn(),
  editProfile: jest.fn(),
};

describe('UserController - Register', () => {
  let controller: UserController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: mockUserService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<UserController>(UserController);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should call service and return created user', async () => {
      const dto: RegisterUserDto = {
        name: 'Test User',
        email: 'test@imox.cloud',
        password: 'password123',
      };

      const result = {
        id: 1,
      };

      mockUserService.register.mockResolvedValue(result);

      expect(await controller.register(dto)).toBe(result);
      expect(mockUserService.register).toHaveBeenCalledWith(dto);
    });
  });
});
