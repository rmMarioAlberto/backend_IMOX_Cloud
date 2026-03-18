import { Test, TestingModule } from '@nestjs/testing';
import { AuthRedisService } from './auth-redis.service';
import { RedisService } from '../redis.service';
import { mockRedisService, mockRedisClient } from '../../../../test/mocks/redis.mock';

describe('AuthRedisService', () => {
  let service: AuthRedisService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthRedisService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<AuthRedisService>(AuthRedisService);
    // Asegurarse que mockRedisClient devuelva true en cada test, sobreescribir si es necesario
    mockRedisService.getClient.mockReturnValue(mockRedisClient);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveSession', () => {
    it('should save session stringified with proper expiration', async () => {
      await service.saveSession(1, 'device1', { refreshToken: 'token', sessionId: 'ses1' });
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'imox:auth:session:1:device1',
        JSON.stringify({ refreshToken: 'token', sessionId: 'ses1' }),
        { EX: 7 * 24 * 60 * 60 }
      );
    });
  });

  describe('getSession', () => {
    it('should return parsed session data', async () => {
      mockRedisClient.get.mockResolvedValueOnce(JSON.stringify({ refreshToken: 'token', sessionId: 'ses1' }));
      const result = await service.getSession(1, 'device1');
      expect(result).toEqual({ refreshToken: 'token', sessionId: 'ses1' });
    });

    it('should return null if session does not exist', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      const result = await service.getSession(1, 'device1');
      expect(result).toBeNull();
    });
  });

  describe('Verification Code Operations', () => {
    it('should save code', async () => {
      await service.saveVerificationCode('test@test.com', '123456');
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        'imox:auth:verification_code:test@test.com',
        '123456',
        { EX: 300 }
      );
    });

    it('should delete code', async () => {
      await service.deleteVerificationCode('test@test.com');
      expect(mockRedisClient.del).toHaveBeenCalledWith('imox:auth:verification_code:test@test.com');
    });
  });

  describe('Other Session and Limits Operations', () => {
    it('deletes session', async () => {
      await service.deleteSession(1, 'dev1');
      expect(mockRedisClient.del).toHaveBeenCalled();
    });
    it('saves password reset token', async () => {
      await service.savePasswordResetToken('token', 1);
      expect(mockRedisClient.set).toHaveBeenCalled();
    });
    it('gets password reset user id', async () => {
      mockRedisClient.get.mockResolvedValueOnce('1');
      expect(await service.getPasswordResetUserId('token')).toBe(1);
    });
    it('deletes password reset token', async () => {
      await service.deletePasswordResetToken('token');
      expect(mockRedisClient.del).toHaveBeenCalled();
    });
    it('increments reset attempt', async () => {
      mockRedisClient.incr.mockResolvedValueOnce(1);
      await service.incrementResetAttempt('email');
      expect(mockRedisClient.expire).toHaveBeenCalled();
    });
    it('gets reset attempts', async () => {
      mockRedisClient.get.mockResolvedValueOnce('2');
      expect(await service.getResetAttempts('email')).toBe(2);
    });
    it('blocks request if limit reached', async () => {
      mockRedisClient.get.mockResolvedValueOnce('1');
      expect(await service.shouldBlockRequest('id', 10)).toBe(true);
    });
    it('allows request if clean', async () => {
      mockRedisClient.get.mockResolvedValueOnce(null);
      expect(await service.shouldBlockRequest('id', 10)).toBe(false);
      expect(mockRedisClient.set).toHaveBeenCalled();
    });
  });

  describe('Token Blacklist', () => {
    it('should blacklist token', async () => {
      await service.blacklistToken('token-to-ban', 3600);
      expect(mockRedisClient.set).toHaveBeenCalledWith('imox:auth:blacklist:token-to-ban', '1', { EX: 3600 });
    });

    it('should verify blacklisted token', async () => {
      mockRedisClient.get.mockResolvedValueOnce('1');
      const isBanned = await service.isTokenBlacklisted('token-to-ban');
      expect(isBanned).toBe(true);
    });
  });
});
