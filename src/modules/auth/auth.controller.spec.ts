import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn().mockResolvedValue({
              accessToken: 'access',
              refreshToken: 'refresh',
              user: { id: 1, email: 'test@imox.com', name: 'Test', role: 'USER' },
            }),
            logout: jest.fn().mockResolvedValue(undefined),
            refreshToken: jest.fn().mockResolvedValue({
              accessToken: 'new-access',
              refreshToken: 'new-refresh',
            }),
            sendVerificacionCode: jest.fn().mockResolvedValue(undefined),
            verifyCode: jest.fn().mockResolvedValue(undefined),
            resetPassword: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('development'),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should set cookie and return tokens', async () => {
      const mockRes = { cookie: jest.fn() } as any;
      const result = await controller.login({ email: 'test@imox.com', password: 'test' }, mockRes);
      expect(result.accessToken).toBe('access');
      expect(mockRes.cookie).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should clear cookies and call authService', async () => {
      const mockReq = { cookies: { refreshToken: '123' } } as any;
      const mockRes = { clearCookie: jest.fn() } as any;
      const result = await controller.logout(mockReq, mockRes);
      
      expect(authService.logout).toHaveBeenCalledWith('123');
      expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(result.message).toBe('Sesión cerrada exitosamente');
    });

    it('should handle undefined refreshToken gracefully in logout', async () => {
       const mockReq = { cookies: {} } as any;
       const mockRes = { clearCookie: jest.fn() } as any;
       await controller.logout(mockReq, mockRes);
       expect(authService.logout).not.toHaveBeenCalled();
       expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken');
    });
  });

  describe('refreshToken', () => {
    it('should retrieve new tokens and set cookie', async () => {
      const mockReq = { cookies: { refreshToken: '123' } } as any;
      const mockRes = { cookie: jest.fn() } as any;
      const result = await controller.refreshToken(mockReq, mockRes);
      
      expect(authService.refreshToken).toHaveBeenCalledWith('123');
      expect(mockRes.cookie).toHaveBeenCalled();
      expect(result.accessToken).toBe('new-access');
    });

    it('should throw UnauthorizedException if refreshToken cookie missing in refresh token', async () => {
      const mockReq = { cookies: {} } as any;
      const mockRes = { cookie: jest.fn() } as any;
      await expect(controller.refreshToken(mockReq, mockRes)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('sendVerificationCode', () => {
    it('should return success string', async () => {
      const res = await controller.sendVerificationCode({ email: 'test@imox.com' });
      expect(res.message).toBe('Código de verificación enviado exitosamente');
    });
  });

  describe('verifyCode', () => {
    it('should return success string', async () => {
      const res = await controller.verifyCode({ email: 'test@imox.com', code: '123456' });
      expect(res.message).toBe('Código verificado');
    });
  });

  describe('resetPassword', () => {
    it('should return success string', async () => {
      const res = await controller.resetPassword({ email: 't@imox.com', code: '123456', newPassword: 'NewPassword1!' });
      expect(res.message).toBe('Contraseña actualizada exitosamente');
    });
  });
});
