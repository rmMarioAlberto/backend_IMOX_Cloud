import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import { MariaDbService } from '../database/mariadb.service';
import { JwtService } from './jwt.service';
import { UnauthorizedException } from '@nestjs/common';

// iniciar mock de bcrypt para que no genere error de importación en el servicio
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));
import * as bcrypt from 'bcrypt';

// iniciar mock de redis para que no genere error de importación en el servicio
const mockRedisService = {
  saveSession: jest.fn(),
  getSession: jest.fn(),
  deleteSession: jest.fn(),
  blacklistToken: jest.fn(),
  isTokenBlacklisted: jest.fn(),
};

// iniciar mock de prisma para que no genere error de importación en el servicio
const mockMariaDbService = {
  users: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  iot: {
    findUnique: jest.fn(),
    update: jest.fn(),
  },
};

// iniciar mock de jwt para que no genere error de importación en el servicio
const mockJwtService = {
  generateAccessToken: jest.fn(),
  generateRefreshToken: jest.fn(),
  verifyRefreshToken: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: AuthRedisService, useValue: mockRedisService },
        { provide: MariaDbService, useValue: mockMariaDbService },
        { provide: JwtService, useValue: mockJwtService },
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
        status: 1,
      };

      // Mock implementations
      mockMariaDbService.users.findUnique.mockResolvedValue(mockUser);
      mockJwtService.generateAccessToken.mockResolvedValue('access_token');
      mockJwtService.generateRefreshToken.mockResolvedValue('refresh_token');

      // Mock bcrypt
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'test@imox.cloud',
        password: 'password123',
      });

      expect(mockMariaDbService.users.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@imox.cloud', status: 1 },
      });
      expect(mockRedisService.saveSession).toHaveBeenCalled();
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
  });

  describe('resetPassword', () => {
    const resetDto = {
      userId: 1,
      macAddress: 'AA:BB:CC:DD:EE:FF',
      newPassword: 'newPassword123',
    };

    it('debería resetear la contraseña si el dispositivo pertenece al usuario', async () => {
      mockMariaDbService.iot.findUnique.mockResolvedValue({
        mac_address: resetDto.macAddress,
        user_id: 1,
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_new_password');

      await service.resetPassword(resetDto);

      expect(mockMariaDbService.users.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { password: 'hashed_new_password' },
      });
    });

    it('debería vincular el dispositivo y resetear si no tiene dueño', async () => {
      mockMariaDbService.iot.findUnique.mockResolvedValue({
        mac_address: resetDto.macAddress,
        user_id: null,
      });
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_new_password');

      await service.resetPassword(resetDto);

      expect(mockMariaDbService.iot.update).toHaveBeenCalledWith({
        where: { mac_address: resetDto.macAddress },
        data: { user_id: 1 },
      });
      expect(mockMariaDbService.users.update).toHaveBeenCalled();
    });

    it('debería fallar si el dispositivo pertenece a otro usuario', async () => {
      mockMariaDbService.iot.findUnique.mockResolvedValue({
        mac_address: resetDto.macAddress,
        user_id: 2,
      });

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('debería fallar si el dispositivo no existe', async () => {
      mockMariaDbService.iot.findUnique.mockResolvedValue(null);

      await expect(service.resetPassword(resetDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
