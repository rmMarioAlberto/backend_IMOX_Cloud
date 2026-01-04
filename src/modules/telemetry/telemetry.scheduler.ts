import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { TelemetryReadingDto } from './dto/telemetry-reading.dto';

@Injectable()
export class TelemetryScheduler {
  private readonly logger = new Logger(TelemetryScheduler.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly prismaMongo: PrismaMongoService,
    private readonly prismaMysql: PrismaMysqlService,
  ) {}

  /**
   * Persistir lecturas en MongoDB cada 5 minutos
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async persistAllDevices() {
    this.logger.log('Ejecutando persistencia programada...');

    try {
      const deviceKeys = await this.redisService.keys('iot:*:last');

      for (const key of deviceKeys) {
        const iotId = this.extractIotId(key);

        const lastReading = await this.redisService.getTelemetryLast(iotId);

        const criticalEvents = await this.redisService.getCriticalEvents(iotId);

        if (!lastReading && criticalEvents.length === 0) {
          continue;
        }

        const device = await this.prismaMysql.iot.findUnique({
          where: { id: iotId },
          select: { user_id: true },
        });

        if (!device || !device.user_id) {
          this.logger.warn(
            `Dispositivo ${iotId} sin user_id asignado, saltando...`,
          );
          continue;
        }

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

        if (readings.length === 0) {
          continue;
        }

        await this.prismaMongo.telemetry.upsert({
          where: {
            iotId_userId: {
              iotId: iotId,
              userId: device.user_id,
            },
          },
          update: {
            readings: {
              push: readings,
            },
          },
          create: {
            iotId: iotId,
            userId: device.user_id,
            readings: readings,
          },
        });

        await this.redisService.clearCriticalEvents(iotId);
      }

      this.logger.log(
        `Persistencia completada para ${deviceKeys.length} dispositivos`,
      );
    } catch (error) {
      this.logger.error('Error en persistencia programada:', error);
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
        parseInt(process.env.TELEMETRY_OFFLINE_TIMEOUT_MIN || '10', 10) *
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
