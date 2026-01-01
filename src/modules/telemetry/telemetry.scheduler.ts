import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RedisService } from '../redis/redis.service';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';

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

        // Obtener última lectura normal
        const lastReading = await this.redisService.getTelemetryLast(iotId);

        // Obtener eventos críticos acumulados
        const criticalEvents = await this.redisService.getCriticalEvents(iotId);

        // Si no hay ni lectura normal ni críticos, saltar
        if (!lastReading && criticalEvents.length === 0) {
          this.logger.debug(
            `Dispositivo ${iotId} sin datos en Redis, saltando...`,
          );
          continue;
        }

        // Obtener userId desde la BD
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

        // Preparar lecturas a guardar
        const readings: any[] = [];

        // Agregar eventos críticos primero (solo campos válidos de Reading)
        for (const event of criticalEvents) {
          readings.push({
            type: 'critical',
            electricas: event.electricas,
            diagnostico: {
              ip: event.diagnostico?.ip || 'unknown',
              rssi_dbm: event.diagnostico?.rssi_dbm || 0,
              pzem_status: event.diagnostico?.pzem_status || 'unknown',
              uptime_s: event.diagnostico?.uptime_s || 0,
              ...event.diagnostico, // Mantiene cualquier otro campo si existe
            },
            timestamp: new Date(event.timestamp || Date.now()),
          });
        }

        // Agregar lectura normal solo si existe
        if (lastReading) {
          readings.push({
            type: 'normal',
            electricas: lastReading.electricas,
            diagnostico: lastReading.diagnostico,
            timestamp: new Date(),
          });
        }

        // Solo guardar si hay algo que persistir
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

        this.logger.debug(
          `Guardando ${readings.length} lecturas para dispositivo ${iotId} (${criticalEvents.length} críticos + ${lastReading ? '1 normal' : '0 normal'})`,
        );
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
      this.logger.error('❌ Error en health check:', error);
    }
  }

  private extractIotId(key: string): number {
    // Key format: iot:{id}:last
    const parts = key.split(':');
    return parseInt(parts[1], 10);
  }
}
