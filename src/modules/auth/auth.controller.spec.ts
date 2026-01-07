import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginUserDto, RefreshTokenDto } from './dto/auth.dto';

const mockAuthService = {
  login: jest.fn(),
  logout: jest.fn(),
  refreshToken: jest.fn(),
  requestPasswordReset: jest.fn(),
  resetPassword: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('should return authentication result', async () => {
      const dto: LoginUserDto = {
        email: 'test@imox.cloud',
        password: 'password',
      };
      const result = {
        accessToken: 'access',
        refreshToken: 'refresh',
        user: { id: 1, email: 'test@imox.cloud', name: 'Test', role: 1 },
      };

      mockAuthService.login.mockResolvedValue(result);

      expect(await controller.login(dto)).toBe(result);
      expect(mockAuthService.login).toHaveBeenCalledWith(dto);
    });
  });

  describe('refreshToken', () => {
    it('should return new tokens', async () => {
      const dto: RefreshTokenDto = { refreshToken: 'old_refresh' };
      const result = { accessToken: 'new_access', refreshToken: 'new_refresh' };

      mockAuthService.refreshToken.mockResolvedValue(result);

      expect(await controller.refreshToken(dto)).toBe(result);
      expect(mockAuthService.refreshToken).toHaveBeenCalledWith(dto);
    });
  });

  describe('logout', () => {
    it('should call logout service', async () => {
      const req = {
        user: { id: 1 }, // Controller uses req.user.id not req.user.sub
        headers: { authorization: 'Bearer token' },
      };
      const result = { message: 'Logged out' };

      mockAuthService.logout.mockResolvedValue(result);

      expect(
        await controller.logout(req as any, {
          refreshToken: '',
          deviceId: 'dev1',
        }),
      ).toBe(result);
      expect(mockAuthService.logout).toHaveBeenCalledWith(
        1,
        'dev1',
        'Bearer token',
      );
    });
  });
});
