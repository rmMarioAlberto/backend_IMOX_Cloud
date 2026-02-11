import { MqttTelemetryDto } from '../../mqtt/dto/mqtt.dto';
import { TelemetryResponseDto } from '../dto/telemetry-response.dto';

/**
 * @description Método que se encarga de transformar los datos de telemetría
 */
export function toTelemetryResponse(
  data: MqttTelemetryDto,
  isCritical: boolean = false,
  anomalyType?: 'SPIKE' | 'LIMIT' | 'NONE',
): TelemetryResponseDto {
  return {
    electricas: {
      voltaje_v: data.electricas?.voltaje_v ?? null,
      corriente_a: data.electricas?.corriente_a ?? null,
      potencia_w: data.electricas?.potencia_w ?? null,
      energia_kwh: data.electricas?.energia_kwh ?? null,
      frecuencia_hz: data.electricas?.frecuencia_hz ?? null,
      factor_potencia: data.electricas?.factor_potencia ?? null,
    },
    diagnostico: {
      ip: data.diagnostico?.ip ?? 'unknown',
      rssi_dbm: data.diagnostico?.rssi_dbm ?? 0,
      pzem_status: data.diagnostico?.pzem_status ?? 'unknown',
      uptime_s: data.diagnostico?.uptime_s ?? 0,
    },
    timestamp: data.timestamp || new Date().toISOString(),
    is_critical: isCritical,
    anomaly_type: anomalyType,
  };
}
