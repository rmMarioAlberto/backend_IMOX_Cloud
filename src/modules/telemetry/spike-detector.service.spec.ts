import { Test, TestingModule } from '@nestjs/testing';
import { SpikeDetectorService } from './spike-detector.service';
import { ConfigService } from '@nestjs/config';

describe('SpikeDetectorService', () => {
  let service: SpikeDetectorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SpikeDetectorService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key) => {
              const config = {
                TELEMETRY_SPIKE_THRESHOLD: '0.15',
                TELEMETRY_VOLTAGE_MAX: '140',
                TELEMETRY_VOLTAGE_MIN: '90',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SpikeDetectorService>(SpikeDetectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('detectAnomaly', () => {
    it('should return LIMIT when voltage is too high', () => {
      const current = { electricas: { voltaje_v: 150 } } as any;
      const result = service.detectAnomaly(current, null);

      expect(result.isCritical).toBe(true);
      expect(result.type).toBe('LIMIT');
    });

    it('should return LIMIT when voltage is too low', () => {
      const current = { electricas: { voltaje_v: 80 } } as any;
      const result = service.detectAnomaly(current, null);

      expect(result.isCritical).toBe(true);
      expect(result.type).toBe('LIMIT');
    });

    it('should return NONE when no baseline and within limits', () => {
      const current = { electricas: { voltaje_v: 120 } } as any;
      const result = service.detectAnomaly(current, null);

      expect(result.isCritical).toBe(false);
      expect(result.type).toBe('NONE');
    });

    it('should return SPIKE when sudden change exceeds threshold', () => {
      const current = { electricas: { voltaje_v: 120, corriente_a: 10, potencia_w: 1200 } } as any;
      const baseline = { electricas: { voltaje_v: 120, corriente_a: 5, potencia_w: 600 } } as any; // 100% Amp change

      const result = service.detectAnomaly(current, baseline);

      expect(result.isCritical).toBe(true);
      expect(result.type).toBe('SPIKE');
      expect(result.message).toContain('Amp 100%');
    });

    it('should filter noise using deadband', () => {
      const current = { electricas: { voltaje_v: 120, corriente_a: 5.2, potencia_w: 610 } } as any;
      const baseline = { electricas: { voltaje_v: 120, corriente_a: 5, potencia_w: 600 } } as any;

      // El incremento es de 0.2A, pero el deadband pide 0.5A minimo para marcar anomalía.
      const result = service.detectAnomaly(current, baseline);

      expect(result.isCritical).toBe(false);
      expect(result.type).toBe('NONE');
    });
  });
});
