import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { RedisService } from '../database/redis.service';
import { MariaDbService } from '../database/mariadb.service';
import { JwtService } from './jwt.service';
import { MailService } from '../mail/mail.service';
import { UnauthorizedException } from '@nestjs/common';

// iniciar mock de bcrypt para que no genere error de importación en el servicio
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

// iniciar mock de redis para que no genere error de importación en el servicio
const mockRedisService = {
  saveRefreshToken: jest.fn(),
  getRefreshToken: jest.fn(),
  deleteRefreshToken: jest.fn(),
  blacklistToken: jest.fn(),
};

// iniciar mock de prisma para que no genere error de importación en el servicio
const mockPrismaService = {
  users: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

// iniciar mock de jwt para que no genere error de importación en el servicio
const mockJwtService = {
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyToken: jest.fn(),
  decode: jest.fn(),
};

// iniciar mock de mail para que no genere error de importación en el servicio
const mockMailService = {
  sendResetEmail: jest.fn(),
};

// iniciar mock de auth para que no genere error de importación en el servicio
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: MariaDbService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('login', () => {
    it('debería retornar tokens si las credenciales son válidas', async () => {
      // Mock data
      const mockUser = {
        id: 1,
        email: 'test@imox.cloud',
        password: 'hashedpassword',
        role: 1,
        name: 'Test User',
      };

      // Mock implementations
      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);
      mockJwtService.generateAccessToken.mockResolvedValue('access_token');
      mockJwtService.generateRefreshToken.mockResolvedValue('refresh_token');

      // Mock bcrypt
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'test@imox.cloud',
        password: 'password123',
      });

      expect(mockPrismaService.users.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@imox.cloud', status: 1 },
      });
      expect(mockRedisService.saveRefreshToken).toHaveBeenCalled();
      expect(result).toEqual({
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        user: {
          id: 1,
          email: 'test@imox.cloud',
          name: 'Test User',
          role: 1,
        },
      });
    });

    it('debería lanzar UnauthorizedException si el usuario no existe', async () => {
      mockPrismaService.users.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ email: 'wrong@imox.cloud', password: '123' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('debería lanzar UnauthorizedException si la contraseña es incorrecta', async () => {
      const mockUser = {
        id: 1,
        password: 'hashedpassword',
      };
      mockPrismaService.users.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'test@imox.cloud', password: 'wrongpassword' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    it('debería retornar nuevos tokens si el refresh token es válido', async () => {
      const userId = 1;
      const deviceId = 'mobile_app_default';

      mockJwtService.verifyToken.mockResolvedValue({
        sub: userId,
        deviceId: deviceId,
      });
      mockRedisService.getRefreshToken.mockResolvedValue('valid_refresh_token');
      mockPrismaService.users.findUnique.mockResolvedValue({
        id: userId,
        email: 'test@imox.cloud',
        role: 1,
      });
      mockJwtService.generateAccessToken.mockResolvedValue('new_access');
      mockJwtService.generateRefreshToken.mockResolvedValue('new_refresh');

      const result = await service.refreshToken({
        refreshToken: 'valid_refresh_token',
      });

      expect(result).toEqual({
        accessToken: 'new_access',
        refreshToken: 'new_refresh',
      });
    });

    it('debería borrar token y lanzar error si no existe en Redis (robo)', async () => {
      mockJwtService.verifyToken.mockResolvedValue({
        sub: 1,
        deviceId: 'dev1',
      });
      // Redis retorna null (token no encontrado)
      mockRedisService.getRefreshToken.mockResolvedValue(null);

      await expect(
        service.refreshToken({ refreshToken: 'stolen_token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('debería eliminar el refresh token de Redis', async () => {
      await service.logout(1, 'dev1');
      expect(mockRedisService.deleteRefreshToken).toHaveBeenCalledWith(
        1,
        'dev1',
      );
    });

    it('debería añadir access token a blacklist si se provee', async () => {
      mockJwtService.decode.mockReturnValue({
        exp: Math.floor(Date.now() / 1000) + 100,
      });

      await service.logout(1, 'dev1', 'Bearer valid_token');

      expect(mockRedisService.blacklistToken).toHaveBeenCalled();
    });
  });
});
