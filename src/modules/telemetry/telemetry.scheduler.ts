import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { TelemetryRedisService } from '../database/telemetry/telemetry-redis.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { MariaDbService } from '../database/mariadb.service';
import { TelemetryReadingDto } from './dto/telemetry-reading.dto';

@Injectable()
export class TelemetryScheduler {
  private readonly logger = new Logger(TelemetryScheduler.name);

  constructor(
    private readonly redisService: TelemetryRedisService,
    private readonly telemetryInfluxService: TelemetryInfluxService,
    private readonly prismaMysql: MariaDbService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Persistir lecturas en InfluxDB cada 5 minutos
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async persistAllDevices() {
    this.logger.log('Ejecutando persistencia programada...');

    try {
      const deviceKeys = await this.redisService.keys('iot:*:last');

      for (const key of deviceKeys) {
        const iotId = this.extractIotId(key);
        await this.processDevice(iotId);
      }

      this.logger.log(
        `Persistencia completada para ${deviceKeys.length} dispositivos`,
      );
    } catch (error) {
      this.logger.error('Error en persistencia programada:', error);
    }
  }

  private async processDevice(iotId: number) {
    const lastReading = await this.redisService.getTelemetryLast(iotId);
    const criticalEvents = await this.redisService.getCriticalEvents(iotId);

    if (!lastReading && criticalEvents.length === 0) {
      return;
    }

    const device = await this.prismaMysql.iot.findUnique({
      where: { id: iotId },
      select: { user_id: true },
    });

    if (!device?.user_id) {
      this.logger.warn(
        `Dispositivo ${iotId} sin user_id asignado, saltando...`,
      );
      return;
    }

    const readings = this.transformToReadings(criticalEvents, lastReading);

    if (readings.length === 0) {
      return;
    }

    await this.saveReadingsToInflux(iotId, readings);
    await this.redisService.clearCriticalEvents(iotId);
  }

  private transformToReadings(
    criticalEvents: any[],
    lastReading: any,
  ): TelemetryReadingDto[] {
    const readings: TelemetryReadingDto[] = [];

    for (const event of criticalEvents) {
      readings.push({
        type: 'critical',
        anomaly_type: event.anomaly_type,
        electricas: {
          voltaje_v: event.electricas?.voltaje_v ?? null,
          corriente_a: event.electricas?.corriente_a ?? null,
          potencia_w: event.electricas?.potencia_w ?? null,
          energia_kwh: event.electricas?.energia_kwh ?? null,
          frecuencia_hz: event.electricas?.frecuencia_hz ?? null,
          factor_potencia: event.electricas?.factor_potencia ?? null,
        },
        diagnostico: {
          ip: event.diagnostico?.ip ?? 'unknown',
          rssi_dbm: event.diagnostico?.rssi_dbm ?? 0,
          pzem_status: event.diagnostico?.pzem_status ?? 'unknown',
          uptime_s: event.diagnostico?.uptime_s ?? 0,
        },
        timestamp: new Date(event.timestamp || Date.now()),
      });
    }

    if (lastReading) {
      readings.push({
        type: 'normal',
        electricas: {
          voltaje_v: lastReading.electricas?.voltaje_v ?? null,
          corriente_a: lastReading.electricas?.corriente_a ?? null,
          potencia_w: lastReading.electricas?.potencia_w ?? null,
          energia_kwh: lastReading.electricas?.energia_kwh ?? null,
          frecuencia_hz: lastReading.electricas?.frecuencia_hz ?? null,
          factor_potencia: lastReading.electricas?.factor_potencia ?? null,
        },
        diagnostico: {
          ip: lastReading.diagnostico?.ip ?? 'unknown',
          rssi_dbm: lastReading.diagnostico?.rssi_dbm ?? 0,
          pzem_status: lastReading.diagnostico?.pzem_status ?? 'unknown',
          uptime_s: lastReading.diagnostico?.uptime_s ?? 0,
        },
        timestamp: new Date(),
      });
    }

    return readings;
  }

  private async saveReadingsToInflux(
    iotId: number,
    readings: TelemetryReadingDto[],
  ) {
    for (const reading of readings) {
      await this.telemetryInfluxService.writeTelemetryPoint(iotId, {
        electricas: reading.electricas,
        diagnostico: reading.diagnostico,
        timestamp: reading.timestamp
          ? reading.timestamp.toISOString()
          : new Date().toISOString(),
        anomaly_type:
          reading.type === 'critical' ? reading.anomaly_type : undefined,
      } as any);
    }
  }

  /**
   * Verificar salud de dispositivos cada 5 minutos
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkDeviceHealth() {
    this.logger.log('Verificando salud de dispositivos...');

    try {
      const deviceKeys = await this.redisService.keys('iot:*:last');
      const offlineThreshold =
        parseInt(
          this.configService.get<string>('TELEMETRY_OFFLINE_TIMEOUT_MIN') ||
            '10',
          10,
        ) *
        60 *
        1000;

      for (const key of deviceKeys) {
        const iotId = this.extractIotId(key);
        const lastData = await this.redisService.getTelemetryLast(iotId);

        if (!lastData) {
          continue;
        }

        const lastTimestamp = new Date(lastData.timestamp || Date.now());
        const age = Date.now() - lastTimestamp.getTime();

        if (age > offlineThreshold) {
          this.logger.warn(
            `Dispositivo ${iotId} sin conexión (${Math.floor(age / 60000)} min sin datos)`,
          );

          await this.prismaMysql.iot.update({
            where: { id: iotId },
            data: { is_online: false },
          });
        }
      }
    } catch (error) {
      this.logger.error('Error en health check:', error);
    }
  }

  private extractIotId(key: string): number {
    // Key format: iot:{id}:last
    const parts = key.split(':');
    return parseInt(parts[1], 10);
  }
}
