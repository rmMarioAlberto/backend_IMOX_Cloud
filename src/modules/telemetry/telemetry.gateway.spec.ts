import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryGateway } from './telemetry.gateway';
import { JwtService } from '../auth/jwt.service';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import { MariaDbService } from '../database/mariadb.service';
import { TelemetryRedisService } from '../database/telemetry/telemetry-redis.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { ConfigService } from '@nestjs/config';

describe('TelemetryGateway', () => {
  let gateway: TelemetryGateway;
  let moduleInstance: TestingModule;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryGateway,
        {
          provide: JwtService,
          useValue: { verifyAccessToken: jest.fn().mockResolvedValue({ sub: 1 }) },
        },
        {
          provide: AuthRedisService,
          useValue: { isTokenBlacklisted: jest.fn().mockResolvedValue(false) },
        },
        {
          provide: MariaDbService,
          useValue: {
            iot: { findUnique: jest.fn().mockResolvedValue({ user_id: 1 }) },
          },
        },
        {
          provide: TelemetryRedisService,
          useValue: { getTelemetryLast: jest.fn().mockResolvedValue(null) },
        },
        {
          provide: TelemetryInfluxService,
          useValue: {
            queryLatestTelemetry: jest.fn().mockResolvedValue({
              _time: '2023-01-01T00:00:00Z',
              voltaje_v: 120,
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
      ],
    }).compile();
    moduleInstance = module;

    gateway = module.get<TelemetryGateway>(TelemetryGateway);
    gateway.server = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    } as any;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    let mockClient: any;
    beforeEach(() => {
      mockClient = {
        handshake: { auth: { token: '123' }, headers: {} },
        data: {},
        disconnect: jest.fn(),
        emit: jest.fn(),
      } as any;
    });

    it('should authenticate user using token', async () => {
      await gateway.handleConnection(mockClient);
      expect(mockClient.data.user.sub).toBe(1);
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should extract token from headers if not in auth', async () => {
      mockClient.handshake.auth = {};
      mockClient.handshake.headers['authorization'] = 'Bearer 123';
      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).not.toHaveBeenCalled();
    });

    it('should disconnect if no token', async () => {
      mockClient.handshake.auth = {};
      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should disconnect if token is blacklisted', async () => {
      const mockRedis = moduleInstance.get<AuthRedisService>(AuthRedisService);
      (mockRedis.isTokenBlacklisted as jest.Mock).mockResolvedValueOnce(true);
      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should handle errors during connection and disconnect', async () => {
      const mockJwt = moduleInstance.get<JwtService>(JwtService);
      (mockJwt.verifyAccessToken as jest.Mock).mockRejectedValueOnce(new Error('JWT Error'));
      await gateway.handleConnection(mockClient);
      expect(mockClient.disconnect).toHaveBeenCalled();
    });

    it('should log on handleDisconnect', () => {
      const loggerSpy = jest.spyOn((gateway as any).logger, 'log');
      gateway.handleDisconnect(mockClient);
      expect(loggerSpy).toHaveBeenCalledWith(expect.stringContaining('Cliente desconectado'));
    });
  });

  describe('handleSubscribeToDevice', () => {
    let mockClient: any;
    beforeEach(() => {
      mockClient = { join: jest.fn(), emit: jest.fn(), data: { user: { sub: 1 } } } as any;
    });

    it('should authenticate ownership and emit data from Influx backup', async () => {
      await gateway.handleSubscribeToDevice(mockClient, { iotId: 1 });
      expect(mockClient.join).toHaveBeenCalledWith('device:1');
      expect(mockClient.emit).toHaveBeenCalled();
    });

    it('should throw error if device not found', async () => {
      const mockDb = moduleInstance.get<MariaDbService>(MariaDbService);
      (mockDb.iot.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await expect(gateway.handleSubscribeToDevice(mockClient, { iotId: 99 })).rejects.toThrow();
    });

    it('should throw error if user does not own device', async () => {
      const mockDb = moduleInstance.get<MariaDbService>(MariaDbService);
      (mockDb.iot.findUnique as jest.Mock).mockResolvedValueOnce({ user_id: 2 });
      await expect(gateway.handleSubscribeToDevice(mockClient, { iotId: 1 })).rejects.toThrow();
    });

    it('should not emit telemetry if both redis and influx return nothing', async () => {
      const mockRedis = moduleInstance.get<TelemetryRedisService>(TelemetryRedisService);
      const mockInflux = moduleInstance.get<TelemetryInfluxService>(TelemetryInfluxService);
      (mockRedis.getTelemetryLast as jest.Mock).mockResolvedValueOnce(null);
      (mockInflux.queryLatestTelemetry as jest.Mock).mockResolvedValueOnce(null);
      
      await gateway.handleSubscribeToDevice(mockClient, { iotId: 1 });
      expect(mockClient.emit).not.toHaveBeenCalled();
    });

    it('should throw WsException if iotId is missing', async () => {
      await expect(gateway.handleSubscribeToDevice(mockClient, { iotId: 0 })).rejects.toThrow();
    });

    it('should throw WsException if user is missing in client data', async () => {
      mockClient.data.user = null;
      await expect(gateway.handleSubscribeToDevice(mockClient, { iotId: 1 })).rejects.toThrow();
    });

    it('should emit data from Redis if available', async () => {
      const mockRedis = moduleInstance.get<TelemetryRedisService>(TelemetryRedisService);
      (mockRedis.getTelemetryLast as jest.Mock).mockResolvedValueOnce({
        electricas: { voltaje_v: 120 },
        diagnostico: { rssi_dbm: -50 },
        timestamp: new Date(),
      });
      await gateway.handleSubscribeToDevice(mockClient, { iotId: 1 });
      expect(mockClient.emit).toHaveBeenCalledWith('telemetry', expect.any(Object));
    });
  });

  describe('handleUnsubscribeFromDevice', () => {
    it('should leave room on unsubscribe', () => {
      const mockClient = { leave: jest.fn(), id: 'client-id' } as any;
      gateway.handleUnsubscribeFromDevice(mockClient, { iotId: 1 });
      expect(mockClient.leave).toHaveBeenCalledWith('device:1');
    });
    it('should return if no iotId', () => {
      const mockClient = { leave: jest.fn() } as any;
      gateway.handleUnsubscribeFromDevice(mockClient, { iotId: 0 });
      expect(mockClient.leave).not.toHaveBeenCalled();
    });
  });

  describe('CORS Configuration', () => {
    it('should validate CORS origins properly', () => {
      const cb = jest.fn();
      
      // Permitir todos en DEV o si no hay variable
      delete process.env.CORS_ORIGINS;
      TelemetryGateway.corsOriginFactory('http://localhost', cb);
      expect(cb).toHaveBeenCalledWith(null, true);

      process.env.CORS_ORIGINS = '*';
      TelemetryGateway.corsOriginFactory('http://localhost', cb);
      expect(cb).toHaveBeenCalledWith(null, true);

      // Origen vacío (ej: postman o client-to-client)
      TelemetryGateway.corsOriginFactory(undefined, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
      
      // Validaciones restrictas
      process.env.CORS_ORIGINS = 'http://test.com, http://example.com';
      TelemetryGateway.corsOriginFactory('http://test.com', cb);
      expect(cb).toHaveBeenCalledWith(null, true);

      // Bloqueo
      TelemetryGateway.corsOriginFactory('http://bad.com', cb);
      expect(cb).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  it('broadcastTelemetry should emit payload to the room', () => {
    gateway.broadcastTelemetry(1, {} as any);
    expect(gateway.server.to).toHaveBeenCalledWith('device:1');
  });
});
