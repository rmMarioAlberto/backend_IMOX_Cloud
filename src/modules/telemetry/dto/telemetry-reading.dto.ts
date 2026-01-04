export interface TelemetryReadingDto {
  type: 'normal' | 'critical';
  anomaly_type?: 'SPIKE' | 'LIMIT' | 'NONE';
  electricas: {
    voltaje_v: number | null;
    corriente_a: number | null;
    potencia_w: number | null;
    energia_kwh: number | null;
    frecuencia_hz: number | null;
    factor_potencia: number | null;
  };
  diagnostico: {
    ip: string;
    rssi_dbm: number;
    pzem_status: string;
    uptime_s: number;
  };
  timestamp: Date;
}
