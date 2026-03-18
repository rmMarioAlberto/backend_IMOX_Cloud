import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from './jwt.strategy';
import { MariaDbService } from '../database/mariadb.service';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;
  let prisma: MariaDbService;
  let redis: AuthRedisService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: MariaDbService,
          useValue: {
            users: {
              findUnique: jest.fn().mockResolvedValue({
                id: 1,
                email: 'test@imox.com',
                role: 'USER',
                status: 1,
              }),
            },
          },
        },
        {
          provide: AuthRedisService,
          useValue: {
            isTokenBlacklisted: jest.fn().mockResolvedValue(false),
            getSession: jest.fn().mockResolvedValue({ sessionId: 'session-123' }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('super-secret-jwt-key'),
          },
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    prisma = module.get<MariaDbService>(MariaDbService);
    redis = module.get<AuthRedisService>(AuthRedisService);
  });

  it('should throw Error if JWT_ACCESS_SECRET is not configured', () => {
    const badConfigMock = { get: jest.fn().mockReturnValue(undefined) } as any;
    expect(() => new JwtStrategy(prisma as any, redis as any, badConfigMock)).toThrow(
      'JWT_ACCESS_SECRET no está configurado'
    );
  });

  it('should return decoded payload if token and session are valid', async () => {
    const mockReq = {
      headers: { authorization: 'Bearer dummy-token' },
    } as Request;

    const payload = { sub: 1, sessionId: 'session-123', deviceId: 'mobile' };
    const result = await strategy.validate(mockReq, payload);

    expect(result).toEqual({ id: 1, email: 'test@imox.com', role: 'USER' });
  });

  it('should throw UnauthorizedException if token is blacklisted', async () => {
    (redis.isTokenBlacklisted as jest.Mock).mockResolvedValue(true);
    const mockReq = { headers: { authorization: 'Bearer dummy-token' } } as Request;

    await expect(strategy.validate(mockReq, { sub: 1 })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException if payload has no sessionId', async () => {
    const mockReq = { headers: { authorization: 'Bearer dummy-token' } } as Request;

    await expect(strategy.validate(mockReq, { sub: 1 })).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException if user not found in database', async () => {
    const mockReq = { headers: { authorization: 'Bearer dummy-token' } } as Request;
    (prisma.users.findUnique as jest.Mock).mockResolvedValue(null);

    const payload = { sub: 1, sessionId: 'session-123' };
    await expect(strategy.validate(mockReq, payload)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
