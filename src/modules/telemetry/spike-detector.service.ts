import { Injectable } from '@nestjs/common';

interface ElectricalData {
  voltaje_v: number;
  corriente_a: number;
  potencia_w: number;
  energia_kwh: number;
  frecuencia_hz: number;
  factor_potencia: number;
}

@Injectable()
export class SpikeDetectorService {
  private readonly threshold = parseFloat(
    process.env.TELEMETRY_SPIKE_THRESHOLD || '0.15',
  );

  detectSpike(current: any, baseline: any): boolean {
    const currentElectrical: ElectricalData = current.electricas;
    const baselineElectrical: ElectricalData = baseline.electricas;

    const voltageChange = Math.abs(
      (currentElectrical.voltaje_v - baselineElectrical.voltaje_v) /
        baselineElectrical.voltaje_v,
    );

    const currentChange = Math.abs(
      (currentElectrical.corriente_a - baselineElectrical.corriente_a) /
        baselineElectrical.corriente_a,
    );

    return voltageChange > this.threshold || currentChange > this.threshold;
  }
}
