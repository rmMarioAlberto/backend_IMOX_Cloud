import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service';
import { MqttTelemetryDto } from '../../mqtt/dto/mqtt.dto';

/**
 * Servicio especializado para operaciones de telemetría IoT en Redis
 * Migrado desde RedisService para mejor organización y separación de responsabilidades
 */
@Injectable()
export class TelemetryRedisService {
  constructor(private readonly redisService: RedisService) {}

  // ==================== Last Telemetry Reading ====================

  /**
   * Guardar última lectura para telemetría (usado por MQTT)
   */
  async setTelemetryLast(
    iotId: number,
    data: MqttTelemetryDto,
    ttl: number = 600,
  ): Promise<void> {
    const client = this.redisService.getClient();
    const key = `iot:${iotId}:last`;
    await client.set(key, JSON.stringify(data), { EX: ttl });
  }

  /**
   * Obtener última lectura de telemetría
   */
  async getTelemetryLast(iotId: number): Promise<MqttTelemetryDto | null> {
    const client = this.redisService.getClient();
    const key = `iot:${iotId}:last`;
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  }

  // ==================== Critical Events Buffer ====================

  /**
   * Agregar evento crítico al buffer
   */
  async pushCriticalEvent(
    iotId: number,
    data: MqttTelemetryDto,
  ): Promise<void> {
    const client = this.redisService.getClient();
    const key = `iot:${iotId}:critical_buffer`;
    await client.lPush(key, JSON.stringify(data));
    // Limitar a últimos 100 eventos
    await client.lTrim(key, 0, 99);
    // Agregar TTL de 1 hora
    await client.expire(key, 3600);
  }

  /**
   * Obtener todos los eventos críticos del buffer
   */
  async getCriticalEvents(iotId: number): Promise<MqttTelemetryDto[]> {
    const client = this.redisService.getClient();
    const key = `iot:${iotId}:critical_buffer`;
    const events = await client.lRange(key, 0, -1);
    return events.map((e) => JSON.parse(e));
  }

  /**
   * Limpiar buffer de eventos críticos
   */
  async clearCriticalEvents(iotId: number): Promise<void> {
    const client = this.redisService.getClient();
    const key = `iot:${iotId}:critical_buffer`;
    await client.del(key);
  }

  // ==================== Baseline for Spike Detection ====================

  /**
   * Guardar baseline para detección de picos
   */
  async setBaseline(
    iotId: number,
    data: MqttTelemetryDto,
    ttl: number = 3600,
  ): Promise<void> {
    const client = this.redisService.getClient();
    const key = `iot:${iotId}:baseline`;
    await client.set(key, JSON.stringify(data), { EX: ttl });
  }

  /**
   * Obtener baseline
   */
  async getBaseline(iotId: number): Promise<MqttTelemetryDto | null> {
    const client = this.redisService.getClient();
    const key = `iot:${iotId}:baseline`;
    const data = await client.get(key);
    return data ? JSON.parse(data) : null;
  }

  // ==================== Utility ====================

  /**
   * Obtener todas las keys que coincidan con un patrón
   */
  async keys(pattern: string): Promise<string[]> {
    const client = this.redisService.getClient();
    return await client.keys(pattern);
  }
}
