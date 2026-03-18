import { Test, TestingModule } from '@nestjs/testing';
import { TelemetryInfluxService } from './telemetry-influx.service';
import { InfluxDbService } from '../influxdb.service';
import { mockInfluxDbService, mockInfluxWriteApi } from '../../../../test/mocks/influxdb.mock';

describe('TelemetryInfluxService', () => {
  let service: TelemetryInfluxService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelemetryInfluxService,
        {
          provide: InfluxDbService,
          useValue: mockInfluxDbService,
        },
      ],
    }).compile();

    service = module.get<TelemetryInfluxService>(TelemetryInfluxService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('writeTelemetryPoint', () => {
    it('should construct and write a new point successfully', async () => {
      const data = {
        electricas: { voltaje_v: 120, corriente_a: 1 },
        diagnostico: { rssi_dbm: -50 },
        timestamp: new Date().toISOString()
      } as any;

      await expect(service.writeTelemetryPoint(1, data)).resolves.not.toThrow();
      expect(mockInfluxDbService.getWriteApi).toHaveBeenCalled();
      expect(mockInfluxWriteApi.writePoint).toHaveBeenCalled();
      expect(mockInfluxWriteApi.flush).toHaveBeenCalled();
    });

    it('should catch errors in writeTelemetryPoint', async () => {
      mockInfluxWriteApi.flush = jest.fn().mockRejectedValueOnce(new Error('Write Error'));
      await expect(service.writeTelemetryPoint(1, {} as any)).rejects.toThrow('Write Error');
    });
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      const mockQueryApi = mockInfluxDbService.getQueryApi();
      mockQueryApi.queryRows = jest.fn().mockImplementation((query, { next, complete }) => {
        next('row', { toObject: () => ({ _time: '2023', val: 120 }) });
        complete();
      });
    });

    it('should queryTelemetryRange successfully', async () => {
      const res = await service.queryTelemetryRange(1, '-1h');
      expect(res.length).toBe(1);
      expect(mockInfluxDbService.getQueryApi().queryRows).toHaveBeenCalled();
    });

    it('should queryAggregatedTelemetry successfully', async () => {
      const res = await service.queryAggregatedTelemetry(1, '-1h');
      expect(res.length).toBe(1);
    });

    it('should queryAnomaliesRange successfully', async () => {
      const res = await service.queryAnomaliesRange(1, '-1h');
      expect(res.length).toBe(1);
    });

    it('should queryLatestTelemetry successfully', async () => {
      const res = await service.queryLatestTelemetry(1);
      expect(res).toBeDefined();
    });

    it('should reject errors in queries', async () => {
      mockInfluxDbService.getQueryApi().queryRows = jest.fn().mockImplementation((q, { error }) => {
        error(new Error('Flux Error'));
      });
      await expect(service.queryTelemetryRange(1, '-1h')).rejects.toThrow('Flux Error');
      await expect(service.queryAggregatedTelemetry(1, '-1h')).rejects.toThrow('Flux Error');
      await expect(service.queryAnomaliesRange(1, '-1h')).rejects.toThrow('Flux Error');
    });

    it('should resolve null in queryLatestTelemetry on error', async () => {
      mockInfluxDbService.getQueryApi().queryRows = jest.fn().mockImplementation((q, { error }) => {
        error(new Error('Flux Error'));
      });
      await expect(service.queryLatestTelemetry(1)).resolves.toBeNull();
    });
  });

  describe('deleteTelemetryByIotId', () => {
    it('should call influxDbService deleteData with proper parameters', async () => {
      await expect(service.deleteTelemetryByIotId(1)).resolves.not.toThrow();
      expect(mockInfluxDbService.deleteData).toHaveBeenCalled();
    });
  });
});
