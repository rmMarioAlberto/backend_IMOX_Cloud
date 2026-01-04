import {
  IsNumber,
  IsString,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type, Expose } from 'class-transformer';

export class ElectricalDataDto {
  @Expose()
  @IsNumber()
  @IsOptional()
  voltaje_v: number | null = null;

  @Expose()
  @IsNumber()
  @IsOptional()
  corriente_a: number | null = null;

  @Expose()
  @IsNumber()
  @IsOptional()
  potencia_w: number | null = null;

  @Expose()
  @IsNumber()
  @IsOptional()
  energia_kwh: number | null = null;

  @Expose()
  @IsNumber()
  @IsOptional()
  frecuencia_hz: number | null = null;

  @Expose()
  @IsNumber()
  @IsOptional()
  factor_potencia: number | null = null;
}

export class DiagnosticDataDto {
  @Expose()
  @IsString()
  @IsOptional()
  ip: string | null = null;

  @Expose()
  @IsNumber()
  @IsOptional()
  rssi_dbm: number | null = null;

  @Expose()
  @IsString()
  @IsOptional()
  pzem_status: string | null = null;

  @Expose()
  @IsNumber()
  @IsOptional()
  uptime_s: number | null = null;
}

export class MqttTelemetryDto {
  @Expose()
  @ValidateNested()
  @Type(() => ElectricalDataDto)
  electricas: ElectricalDataDto;

  @Expose()
  @ValidateNested()
  @Type(() => DiagnosticDataDto)
  diagnostico: DiagnosticDataDto;

  @Expose()
  @IsString()
  @IsOptional()
  timestamp?: string;

  @Expose()
  @IsString()
  @IsOptional()
  anomaly_type?: 'NONE' | 'SPIKE' | 'LIMIT';
}
