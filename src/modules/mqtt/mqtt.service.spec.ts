import { Test, TestingModule } from '@nestjs/testing';
import { MqttService } from './mqtt.service';
import { TelemetryRedisService } from '../database/telemetry/telemetry-redis.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { MariaDbService } from '../database/mariadb.service';
import { ConfigService } from '@nestjs/config';
import { SpikeDetectorService } from '../telemetry/spike-detector.service';
import { TelemetryGateway } from '../telemetry/telemetry.gateway';
import * as mqtt from 'mqtt';

jest.mock('mqtt', () => ({
  connect: jest.fn().mockReturnValue({
    on: jest.fn(),
    subscribe: jest.fn(),
    publish: jest.fn(),
    end: jest.fn(),
  }),
}));

describe('MqttService', () => {
  let service: MqttService;
  let redisService: TelemetryRedisService;
  let mariaDb: MariaDbService;
  let gateway: TelemetryGateway;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttService,
        {
          provide: TelemetryRedisService,
          useValue: {
            setTelemetryLast: jest.fn(),
            getBaseline: jest.fn().mockResolvedValue({ electricas: { voltaje_v: 120 } }),
            setBaseline: jest.fn(),
            pushCriticalEvent: jest.fn(),
          },
        },
        {
          provide: TelemetryInfluxService,
          useValue: {
            queryAggregatedTelemetry: jest.fn().mockResolvedValue([]),
            queryAnomaliesRange: jest.fn().mockResolvedValue([]),
          },
        },
        {
          provide: MariaDbService,
          useValue: {
            iot: {
              findUnique: jest.fn().mockResolvedValue({ id: 1, status: 1 }),
              update: jest.fn(),
            },
            ota_updates: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: SpikeDetectorService,
          useValue: {
            detectAnomaly: jest.fn().mockReturnValue({ isCritical: true, type: 'SPIKE', message: 'test' }),
          },
        },
        {
          provide: TelemetryGateway,
          useValue: {
            broadcastTelemetry: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('mqtt://localhost') },
        },
      ],
    }).compile();

    service = module.get<MqttService>(MqttService);
    redisService = module.get<TelemetryRedisService>(TelemetryRedisService);
    mariaDb = module.get<MariaDbService>(MariaDbService);
    gateway = module.get<TelemetryGateway>(TelemetryGateway);
  });

  it('should connect to mqtt broker on module init', async () => {
    await service.onModuleInit();
    expect(mqtt.connect).toHaveBeenCalled();
  });

  describe('MQTT Client Events', () => {
    it('should register and trigger connect, error, reconnect, and message events', async () => {
      await service.onModuleInit();
      const mockClient = (service as any).client;
      
      const onCalls = mockClient.on.mock.calls;
      const connectCb = onCalls.find(c => c[0] === 'connect')[1];
      const errorCb = onCalls.find(c => c[0] === 'error')[1];
      const reconnectCb = onCalls.find(c => c[0] === 'reconnect')[1];
      const messageCb = onCalls.find(c => c[0] === 'message')[1];

      // trigger connect
      connectCb();
      expect(mockClient.subscribe).toHaveBeenCalledWith('imox/devices/+/telemetry', expect.any(Function));
      
      const subTelemetrycb = mockClient.subscribe.mock.calls[0][1];
      subTelemetrycb(new Error('test')); // with error
      subTelemetrycb(null); // without error
      
      const subHistorycb = mockClient.subscribe.mock.calls[1][1];
      subHistorycb(new Error('test'));
      subHistorycb(null);

      // trigger error
      errorCb(new Error('mqtt error'));

      // trigger reconnect
      reconnectCb();

      // trigger message
      // Payload has to be parseable JSON
      await messageCb('imox/devices/1/telemetry', Buffer.from('{"electricas": {"voltaje_v": 120}}'));
      await messageCb('imox/devices/1/history/request', Buffer.from('{"startDate": "2023-01-01T00:00:00Z", "endDate": "2023-01-02T00:00:00Z"}'));
      await messageCb('unknown/topic', Buffer.from('{}'));
    });
  });

  describe('Message Handlers (simulated)', () => {
    it('handleTelemetry should process payload, detect anomaly and broadcast', async () => {
      await service.onModuleInit(); // Para cargar el 'client' en memoria

      const topic = 'imox/devices/1/telemetry';
      const payload = Buffer.from(
        JSON.stringify({
          electricas: { voltaje_v: 120 },
          timestamp: new Date().toISOString(),
        }),
      );

      await (service as any).handleTelemetry(topic, payload);

      expect(redisService.setTelemetryLast).toHaveBeenCalled();
      expect(mariaDb.iot.update).toHaveBeenCalled();
      expect(redisService.pushCriticalEvent).toHaveBeenCalled();
      expect(gateway.broadcastTelemetry).toHaveBeenCalled();
    });

    it('handleTelemetry - invalid DTO', async () => {
      // Forzar un error de validación rompiendo tipos
      await (service as any).handleTelemetry('imox/devices/1/telemetry', Buffer.from('{"electricas": {"voltaje_v": "string-invalido"}}'));
      expect(mariaDb.iot.findUnique).not.toHaveBeenCalled();
    });

    it('handleTelemetry - device not found', async () => {
      (mariaDb.iot.findUnique as jest.Mock).mockResolvedValueOnce(null);
      await (service as any).handleTelemetry('imox/devices/1/telemetry', Buffer.from('{"electricas": {"voltaje_v": 120}}'));
      expect(mariaDb.iot.update).not.toHaveBeenCalled();
    });

    it('handleTelemetry - device inactive', async () => {
      (mariaDb.iot.findUnique as jest.Mock).mockResolvedValueOnce({ status: 0 });
      await (service as any).handleTelemetry('imox/devices/1/telemetry', Buffer.from('{"electricas": {"voltaje_v": 120}}'));
      expect(mariaDb.iot.update).not.toHaveBeenCalled();
    });

    it('handleTelemetry - catch unknown error', async () => {
      (mariaDb.iot.findUnique as jest.Mock).mockRejectedValueOnce(new Error('DB fail'));
      await (service as any).handleTelemetry('imox/devices/1/telemetry', Buffer.from('{"electricas": {"voltaje_v": 120}}'));
    });

    it('handleTelemetry - branch without baseline', async () => {
      (redisService.getBaseline as jest.Mock).mockResolvedValueOnce(null);
      await (service as any).handleTelemetry('imox/devices/1/telemetry', Buffer.from('{"electricas": {"voltaje_v": 120}}'));
      expect(redisService.setBaseline).toHaveBeenCalled();
    });

    it('handleTelemetry - branch NO anomaly', async () => {
      const spikeMock = service['spikeDetector'] as any;
      spikeMock.detectAnomaly.mockReturnValueOnce({ isCritical: false, type: 'NONE' });
      await (service as any).handleTelemetry('imox/devices/1/telemetry', Buffer.from('{"electricas": {"voltaje_v": 120}}'));
      expect(redisService.setBaseline).toHaveBeenCalled();
    });

    it('handleHistoryRequest should query influx returning payload', async () => {
      await service.onModuleInit(); 
      const topic = 'imox/devices/1/history/request';
      const payload = Buffer.from(
        JSON.stringify({
          startDate: '2023-01-01T00:00:00Z',
          endDate: '2023-01-02T00:00:00Z',
        }),
      );

      await (service as any).handleHistoryRequest(topic, payload);
      const clientMock = (service as any).client;
      expect(clientMock.publish).toHaveBeenCalled();
    });

    it('handleHistoryRequest - invalid DTO', async () => {
      await service.onModuleInit();
      // Forzar error de startDate invalida
      await (service as any).handleHistoryRequest('imox/devices/1/history/request', Buffer.from('{"startDate": "no-es-fecha"}'));
      const clientMock = (service as any).client;
      expect(clientMock.publish).toHaveBeenCalled();
    });

    it('handleHistoryRequest - catch influx error', async () => {
      await service.onModuleInit();
      const influxService = service['influxService'] as any;
      influxService.queryAggregatedTelemetry.mockRejectedValueOnce(new Error('Influx Error'));
      
      await (service as any).handleHistoryRequest('imox/devices/1/history/request', Buffer.from('{"startDate": "2023-01-01T00:00:00Z", "endDate": "2023-01-02T00:00:00Z"}'));
    });

    it('publish callback error coverage', async () => {
      await service.onModuleInit();
      const mockClient = (service as any).client;
      (service as any).publish('topic', {});
      const publishCb = mockClient.publish.mock.calls[0][3];
      if (publishCb) {
        publishCb(new Error('Publish err'));
        publishCb(null);
      }
    });

    it('handleHistoryRequest - empty results coverage', async () => {
      await service.onModuleInit();
      const influxService = service['influxService'] as any;
      influxService.queryAggregatedTelemetry.mockResolvedValueOnce([]);
      influxService.queryAnomaliesRange.mockResolvedValueOnce([]);
      
      await (service as any).handleHistoryRequest('imox/devices/1/history/request', Buffer.from('{"startDate": "2023-01-01T00:00:00Z", "endDate": "2023-01-02T00:00:00Z"}'));
    });

    it('publishOtaCommand should publish with retain: true', async () => {
      await service.onModuleInit();
      const mockClient = (service as any).client;
      service.publishOtaCommand(1, { job_id: 'test' });
      expect(mockClient.publish).toHaveBeenCalledWith(
        'imox/devices/1/ota/command',
        JSON.stringify({ job_id: 'test' }),
        { qos: 1, retain: true },
        expect.any(Function),
      );
      
      const publishCb = mockClient.publish.mock.calls.find(c => c[0] === 'imox/devices/1/ota/command')[3];
      publishCb(new Error('err'));
      publishCb(null);
    });

    it('handleOtaStatus should update DB and clean retained message if final', async () => {
      await service.onModuleInit();
      const topic = 'imox/devices/1/ota/status';
      const payload = Buffer.from(JSON.stringify({ job_id: 'job1', status: 'COMPLETED', step: 'DONE' }));
      
      (mariaDb.ota_updates.findUnique as jest.Mock).mockResolvedValue({ job_id: 'job1' });

      await (service as any).handleOtaStatus(topic, payload);

      expect(mariaDb.ota_updates.update).toHaveBeenCalledWith({
        where: { job_id: 'job1' },
        data: { status: 'COMPLETED', step: 'DONE' },
      });
      const mockClient = (service as any).client;
      expect(mockClient.publish).toHaveBeenCalledWith('imox/devices/1/ota/command', '', { qos: 1, retain: true }, expect.any(Function));

      // Trigger the clean-up callback for coverage
      const cleanUpCb = mockClient.publish.mock.calls.find(c => c[0] === 'imox/devices/1/ota/command' && c[1] === '')[3];
      cleanUpCb(null); // Success
    });

    it('handleOtaStatus - invalid payload', async () => {
      await (service as any).handleOtaStatus('imox/devices/1/ota/status', Buffer.from('{"status": "PENDING"}')); // Missing job_id
      expect(mariaDb.ota_updates.findUnique).not.toHaveBeenCalled();
    });

    it('handleOtaStatus - ota update not found', async () => {
      (mariaDb.ota_updates.findUnique as jest.Mock).mockResolvedValue(null);
      await (service as any).handleOtaStatus('imox/devices/1/ota/status', Buffer.from('{"job_id": "none", "status": "PENDING"}'));
      expect(mariaDb.ota_updates.update).not.toHaveBeenCalled();
    });

    it('handleOtaStatus - catch error', async () => {
      (mariaDb.ota_updates.findUnique as jest.Mock).mockRejectedValue(new Error('error'));
      await (service as any).handleOtaStatus('imox/devices/1/ota/status', Buffer.from('{"job_id": "error", "status": "PENDING"}'));
    });
  });

  it('should disconnect on module destroy', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();
    const clientMock = (service as any).client;
    expect(clientMock.end).toHaveBeenCalled();
  });
});
