import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { MqttTelemetryDto } from '../mqtt/dto/mqtt.dto';

export interface AnomalyResult {
  isCritical: boolean;
  type: 'NONE' | 'SPIKE' | 'LIMIT';
  message?: string;
}

@Injectable()
export class SpikeDetectorService {
  private readonly threshold: number;
  private readonly maxVoltage: number;
  private readonly minVoltage: number;

  constructor(private readonly configService: ConfigService) {
    this.threshold = parseFloat(
      this.configService.get<string>('TELEMETRY_SPIKE_THRESHOLD') || '0.15',
    );
    this.maxVoltage = parseFloat(
      this.configService.get<string>('TELEMETRY_VOLTAGE_MAX') || '140',
    );
    this.minVoltage = parseFloat(
      this.configService.get<string>('TELEMETRY_VOLTAGE_MIN') || '90',
    );
  }

  detectAnomaly(
    current: MqttTelemetryDto,
    baseline: MqttTelemetryDto | null,
  ): AnomalyResult {
    if (!current.electricas) {
      return { isCritical: false, type: 'NONE' };
    }

    const currentVolt = current.electricas.voltaje_v;

    // 1. Detección de Límites Absolutos
    if (currentVolt !== null) {
      if (currentVolt > this.maxVoltage) {
        return {
          isCritical: true,
          type: 'LIMIT',
          message: `Voltaje Alto: ${currentVolt}V > ${this.maxVoltage}V`,
        };
      }
      if (currentVolt < this.minVoltage) {
        return {
          isCritical: true,
          type: 'LIMIT',
          message: `Voltaje Bajo: ${currentVolt}V < ${this.minVoltage}V`,
        };
      }
    }

    // 2. Detección de Picos Relativos
    if (!baseline || !baseline.electricas) {
      return { isCritical: false, type: 'NONE' };
    }

    const currentElectrical = current.electricas;
    const baselineElectrical = baseline.electricas;

    const calculateChange = (curr: number | null, base: number | null) => {
      if (curr === null || base === null) return 0;
      if (base === 0) return curr > 0 ? 1 : 0;
      return Math.abs((curr - base) / base);
    };

    const voltageChange = calculateChange(
      currentElectrical.voltaje_v,
      baselineElectrical.voltaje_v,
    );

    const currentChange = calculateChange(
      currentElectrical.corriente_a,
      baselineElectrical.corriente_a,
    );

    if (voltageChange > this.threshold || currentChange > this.threshold) {
      return {
        isCritical: true,
        type: 'SPIKE',
        message: `Pico detectado: Volt ${Math.round(
          voltageChange * 100,
        )}% / Amp ${Math.round(currentChange * 100)}%`,
      };
    }

    return { isCritical: false, type: 'NONE' };
  }
}
