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
    this.threshold = Number.parseFloat(
      this.configService.get<string>('TELEMETRY_SPIKE_THRESHOLD') || '0.15',
    );
    this.maxVoltage = Number.parseFloat(
      this.configService.get<string>('TELEMETRY_VOLTAGE_MAX') || '140',
    );
    this.minVoltage = Number.parseFloat(
      this.configService.get<string>('TELEMETRY_VOLTAGE_MIN') || '90',
    );
  }

  /**
   * @description Método que se encarga de detectar anomalías en los datos de telemetría
   */
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
    if (!baseline?.electricas) {
      return { isCritical: false, type: 'NONE' };
    }

    const currentElectrical = current.electricas;
    const baselineElectrical = baseline.electricas;

    const calculateChange = (
      curr: number | null,
      base: number | null,
      minDiff: number,
    ) => {
      if (curr === null || base === null) return 0;
      
      const diff = Math.abs(curr - base);

      // Filtro de ruido (Deadband absoluto mínimo):
      // Si la diferencia absoluta es diminuta, no disparamos el cálculo porcentual.
      if (diff < minDiff) return 0;

      if (base === 0) return curr > 0 ? 1 : 0;
      return diff / base;
    };

    const voltageChange = calculateChange(
      currentElectrical.voltaje_v,
      baselineElectrical.voltaje_v,
      5, // Deadband: 5 Volts
    );

    const currentChange = calculateChange(
      currentElectrical.corriente_a,
      baselineElectrical.corriente_a,
      0.5, // Deadband: 0.5 Amperes
    );

    const powerChange = calculateChange(
      currentElectrical.potencia_w,
      baselineElectrical.potencia_w,
      50, // Deadband: 50 Watts
    );

    if (
      voltageChange > this.threshold ||
      currentChange > this.threshold ||
      powerChange > this.threshold
    ) {
      let spikeReason = '';
      if (voltageChange > this.threshold) spikeReason += `Volt ${Math.round(voltageChange * 100)}% `;
      if (currentChange > this.threshold) spikeReason += `Amp ${Math.round(currentChange * 100)}% `;
      if (powerChange > this.threshold) spikeReason += `Pwr ${Math.round(powerChange * 100)}% `;

      return {
        isCritical: true,
        type: 'SPIKE',
        message: `Pico detectado: ${spikeReason.trim()}`,
      };
    }

    return { isCritical: false, type: 'NONE' };
  }
}

