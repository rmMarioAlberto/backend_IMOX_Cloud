import { DeadbandUtil } from './deadband.util';

describe('DeadbandUtil', () => {
  describe('calculateAggregationWindow', () => {
    it('returns 6h for > 7 days', () => {
      const start = new Date('2023-01-01');
      const stop = new Date('2023-01-09');
      expect(DeadbandUtil.calculateAggregationWindow(start, stop)).toBe('6h');
    });

    it('returns 1h for > 2 days', () => {
      const start = new Date('2023-01-01');
      const stop = new Date('2023-01-04');
      expect(DeadbandUtil.calculateAggregationWindow(start, stop)).toBe('1h');
    });

    it('returns 15m for > 12 hours', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const stop = new Date('2023-01-01T15:00:00Z');
      expect(DeadbandUtil.calculateAggregationWindow(start, stop)).toBe('15m');
    });

    it('returns 5m for short durations', () => {
      const start = new Date('2023-01-01T00:00:00Z');
      const stop = new Date('2023-01-01T04:00:00Z');
      expect(DeadbandUtil.calculateAggregationWindow(start, stop)).toBe('5m');
    });
  });

  describe('applyDeadband', () => {
    const baseDate = new Date('2023-01-01T00:00:00Z');

    it('filters empty or undefined rows', () => {
      const combined = [
        { _time: '2023-01-01T00:00:00Z' }, // Invalid, missing both v and c
        { _time: '2023-01-01T00:05:00Z', voltaje_v: 120, corriente_a: 5 },
      ];
      const res = DeadbandUtil.applyDeadband(combined, '5m');
      expect(res.length).toBe(1); // Solo toma el segundo que es válido y primero (borde)
    });

    it('always pushes essential points (first, last, anomalies)', () => {
      const combined = [
        { _time: '2023-01-01T00:00:00Z', voltaje_v: 120 }, // First
        { _time: '2023-01-01T00:05:00Z', voltaje_v: 120.1 }, // Normal, might filter
        { _time: '2023-01-01T00:10:00Z', voltaje_v: 180, anomaly_type: 'SPIKE' }, // Anomaly
        { _time: '2023-01-01T00:15:00Z', voltaje_v: 120.2 }, // Last
      ];

      const res = DeadbandUtil.applyDeadband(combined, '5m');
      // Debe dejar el primero, el SPIKE y el último (no cambian más que .2)
      expect(res.length).toBe(3);
      expect(res[1][5]).toBe('SPIKE');
    });

    it('pushes the previous point if there is a significant fluctuation', () => {
      const combined = [
        { _time: '2023-01-01T00:00:00Z', voltaje_v: 120 }, // First
        { _time: '2023-01-01T00:05:00Z', voltaje_v: 120 }, // Ignored initially
        { _time: '2023-01-01T00:10:00Z', voltaje_v: 125 }, // Fluctuation! 
        { _time: '2023-01-01T00:15:00Z', voltaje_v: 125 }, // Last Dummy
      ];

      // Fluctuation happens between 120 and 125. The code should include the prev stable state (120 at 05:00) before changing to 125.
      const res = DeadbandUtil.applyDeadband(combined, '5m');
      
      expect(res.length).toBe(4); // First, Prev, Fluctuation, Last
      expect(res[1][0]).toBe('2023-01-01T00:05:00Z'); // El punto previo a la subida fue inyectado
    });

    it('handles long aggregation windows naturally', () => {
      const combined = [
        { _time: '2023-01-01T00:00:00Z', voltaje_v: 120 },
        { _time: '2023-01-01T06:00:00Z', voltaje_v: 120 },
      ];
      // When window is 6h, it includes points simply based on different timestamps, not minor fluctuations
      const res = DeadbandUtil.applyDeadband(combined, '6h');
      expect(res.length).toBe(2);
    });

    it('pushes points when time expires > 1 hour regardless of stability', () => {
      const combined = [
        { _time: '2023-01-01T00:00:00Z', voltaje_v: 120 },
        { _time: '2023-01-01T00:15:00Z', voltaje_v: 120 }, // Same value, ignored
        { _time: '2023-01-01T01:30:00Z', voltaje_v: 120 }, // 1.5 horas después, debe entrar por `maxTimeExceeded`
        { _time: '2023-01-01T01:35:00Z', voltaje_v: 120 }, // Dummy Last Dummy
      ];

      const res = DeadbandUtil.applyDeadband(combined, '5m');
      expect(res.length).toBe(4); 
    });
  });
});
