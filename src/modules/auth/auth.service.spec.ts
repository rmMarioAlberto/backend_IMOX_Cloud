import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { MariaDbService } from '../database/mariadb.service';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import { JwtService } from './jwt.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

jest.mock('mailersend', () => {
  return {
    MailerSend: jest.fn().mockImplementation(() => ({
      email: { send: jest.fn().mockResolvedValue(true) },
    })),
    EmailParams: jest.fn().mockImplementation(() => ({
      setFrom: jest.fn().mockReturnThis(),
      setTo: jest.fn().mockReturnThis(),
      setSubject: jest.fn().mockReturnThis(),
      setHtml: jest.fn().mockReturnThis(),
      setText: jest.fn().mockReturnThis(),
    })),
    Sender: jest.fn(),
    Recipient: jest.fn(),
  };
});

describe('AuthService', () => {
  let service: AuthService;
  let mariaDbService: MariaDbService;
  let redisService: AuthRedisService;
  let jwtService: JwtService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: MariaDbService,
          useValue: {
            users: {
              findUnique: jest.fn().mockResolvedValue({
                id: 1,
                email: 'test@imox.com',
                password: 'hashed-password',
                status: 1,
                role: 'USER',
              }),
              update: jest.fn(),
            },
          },
        },
        {
          provide: AuthRedisService,
          useValue: {
            saveSession: jest.fn(),
            isTokenBlacklisted: jest.fn().mockResolvedValue(false),
            verifyRefreshToken: jest.fn(),
            getSession: jest.fn().mockResolvedValue({ refreshToken: 'valid-refresh-token', sessionId: 'ses-1' }),
            deleteSession: jest.fn(),
            blacklistToken: jest.fn(),
            getResetAttempts: jest.fn().mockResolvedValue(0),
            saveVerificationCode: jest.fn(),
            incrementResetAttempt: jest.fn(),
            deleteVerificationCode: jest.fn(),
            getVerificationCode: jest.fn().mockResolvedValue('123456'),
          },
        },
        {
          provide: JwtService,
          useValue: {
            generateAccessToken: jest.fn().mockResolvedValue('access-token'),
            generateRefreshToken: jest.fn().mockResolvedValue('refresh-token'),
            verifyRefreshToken: jest.fn().mockResolvedValue({ sub: 1, exp: Math.floor(Date.now() / 1000) + 3600 }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('config-value') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    mariaDbService = module.get<MariaDbService>(MariaDbService);
    redisService = module.get<AuthRedisService>(AuthRedisService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('login', () => {
    it('should return tokens if credentials are valid', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      
      const result = await service.login({ email: 'test@imox.com', password: 'password123' });
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user.email).toBe('test@imox.com');
    });

    it('should throw UnauthorizedException if password mismatches', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);
      await expect(service.login({ email: 'test@imox.com', password: 'wrong' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.login({ email: 'no-existe@imox.com', password: 'any' })).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should blacklist token and delete session', async () => {
      await service.logout('valid-refresh-token');
      expect(redisService.blacklistToken).toHaveBeenCalled();
      expect(redisService.deleteSession).toHaveBeenCalled();
    });

    it('should return early if token is already blacklisted', async () => {
      (redisService.isTokenBlacklisted as jest.Mock).mockResolvedValueOnce(true);
      await service.logout('already-blacklisted');
      expect(redisService.deleteSession).not.toHaveBeenCalled();
    });

    it('should handle verification errors silently', async () => {
      (jwtService.verifyRefreshToken as jest.Mock).mockRejectedValueOnce(new Error('Invalid token'));
      await expect(service.logout('invalid-token')).resolves.not.toThrow();
    });
  });

  describe('refreshToken', () => {
    it('should issue new tokens for valid refresh token', async () => {
      const result = await service.refreshToken('valid-refresh-token');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('should throw if token is blacklisted', async () => {
      (redisService.isTokenBlacklisted as jest.Mock).mockResolvedValueOnce(true);
      await expect(service.refreshToken('blacklisted-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw and delete session if token differs', async () => {
      (redisService.getSession as jest.Mock).mockResolvedValueOnce({ refreshToken: 'different-token', sessionId: 'ses-1' });
      await expect(service.refreshToken('token-attempt')).rejects.toThrow(UnauthorizedException);
      expect(redisService.deleteSession).toHaveBeenCalled();
    });

    it('should throw if user not found or inactive', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.refreshToken('valid-token')).rejects.toThrow(UnauthorizedException);
    });

    it('should apply rotation/blacklist and return new tokens', async () => {
       const result = await service.refreshToken('valid-refresh-token');
       expect(redisService.blacklistToken).toHaveBeenCalled();
       expect(result).toHaveProperty('accessToken');
    });
  });

  describe('sendVerificacionCode', () => {
    it('should orchestrate mailersend properly', async () => {
      await expect(service.sendVerificacionCode('test@imox.com')).resolves.not.toThrow();
      expect(redisService.saveVerificationCode).toHaveBeenCalled();
      expect(redisService.incrementResetAttempt).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if too many attempts', async () => {
      (redisService.getResetAttempts as jest.Mock).mockResolvedValueOnce(3);
      await expect(service.sendVerificacionCode('test@imox.com')).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if user not found', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.sendVerificacionCode('no-existe@imox.com')).rejects.toThrow(UnauthorizedException);
    });

    it('should catch mailersend error and throw BadRequestException', async () => {
      const mockMailerSend = require('mailersend');
      mockMailerSend.MailerSend.mockImplementationOnce(() => ({
        email: { send: jest.fn().mockRejectedValueOnce(new Error('Send limit reached')) },
      }));
      await expect(service.sendVerificacionCode('test@imox.com')).rejects.toThrow(BadRequestException);
    });
  });

  describe('verifyCode', () => {
    it('should pass for matching code', async () => {
      await expect(service.verifyCode('test@imox.com', '123456')).resolves.not.toThrow();
    });

    it('should throw for invalid code', async () => {
      await expect(service.verifyCode('test@imox.com', '000000')).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('resetPassword', () => {
    it('should change password successfully', async () => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');
      await service.resetPassword({ email: 'test@imox.com', code: '123456', newPassword: 'NewPassword1!' });
      expect(mariaDbService.users.update).toHaveBeenCalled();
      expect(redisService.deleteVerificationCode).toHaveBeenCalled();
    });

    it('should throw if user not found', async () => {
      (mariaDbService.users.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.resetPassword({ email: 'no-existe@imox.com', code: '123456', newPassword: 'pass' })).rejects.toThrow(UnauthorizedException);
    });

    it('should throw if code is invalid', async () => {
      (redisService.getVerificationCode as jest.Mock).mockResolvedValueOnce('wrong');
      await expect(service.resetPassword({ email: 'test@imox.com', code: '123456', newPassword: 'pass' })).rejects.toThrow(UnauthorizedException);
    });
  });
});
