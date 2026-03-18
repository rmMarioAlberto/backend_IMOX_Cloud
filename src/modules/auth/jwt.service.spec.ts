import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from './jwt.service';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

describe('JwtService (Custom Wrapper)', () => {
  let service: JwtService;
  let nestJwtService: NestJwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtService,
        {
          provide: NestJwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('signed-token'),
            verifyAsync: jest.fn().mockResolvedValue({ sub: 1 }),
            decode: jest.fn().mockReturnValue({ sub: 1 }),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              const keys = {
                JWT_ACCESS_SECRET: 'access-secret',
                JWT_REFRESH_SECRET: 'refresh-secret',
                JWT_ACCESS_EXPIRES_IN: '15m',
                JWT_REFRESH_EXPIRES_IN: '7d',
              };
              return keys[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<JwtService>(JwtService);
    nestJwtService = module.get<NestJwtService>(NestJwtService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should generate access token successfully', async () => {
    const token = await service.generateAccessToken({ sub: 1, role: 'USER' });
    expect(token).toBe('signed-token');
    expect(nestJwtService.signAsync).toHaveBeenCalled();
  });

  it('should generate refresh token successfully', async () => {
    const token = await service.generateRefreshToken({ sub: 1 });
    expect(token).toBe('signed-token');
    expect(nestJwtService.signAsync).toHaveBeenCalled();
  });

  it('should verify access token successfully', async () => {
    const result = await service.verifyAccessToken('dummy.token');
    expect(result).toEqual({ sub: 1 });
    expect(nestJwtService.verifyAsync).toHaveBeenCalled();
  });

  it('should decode token payload without verifying', () => {
    const result = service.decode('dummy.token');
    expect(result).toEqual({ sub: 1 });
    expect(nestJwtService.decode).toHaveBeenCalled();
  });
});
