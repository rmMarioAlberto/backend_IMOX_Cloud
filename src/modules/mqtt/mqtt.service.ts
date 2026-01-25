import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as mqtt from 'mqtt';
import { MqttClient } from 'mqtt';
import { TelemetryRedisService } from '../database/telemetry/telemetry-redis.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { MariaDbService } from '../database/mariadb.service';
import { ConfigService } from '@nestjs/config';
import { SpikeDetectorService } from '../telemetry/spike-detector.service';
import { TelemetryGateway } from '../telemetry/telemetry.gateway';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MqttTelemetryDto } from './dto/mqtt.dto';
import { toTelemetryResponse } from '../telemetry/utils/telemetry.mapper';

@Injectable()
export class MqttService implements OnModuleInit {
  private client: MqttClient;
  private readonly logger = new Logger(MqttService.name);

  constructor(
    private readonly redisService: TelemetryRedisService,
    private readonly influxService: TelemetryInfluxService,
    private readonly prismaMysql: MariaDbService,
    private readonly spikeDetector: SpikeDetectorService,
    private readonly telemetryGateway: TelemetryGateway,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.connectToBroker();
  }

  private async connectToBroker() {
    const brokerUrl =
      this.configService.get<string>('MQTT_BROKER_URL') ||
      'mqtt://localhost:1883';
    const clientId =
      this.configService.get<string>('MQTT_CLIENT_ID') || 'imox_backend';
    const username = this.configService.get<string>('MQTT_USER');
    const password = this.configService.get<string>('MQTT_PASSWORD');

    this.logger.log(`Conectando al broker MQTT: ${brokerUrl}`);

    this.client = mqtt.connect(brokerUrl, {
      clientId,
      username,
      password,
      clean: true,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    });

    this.client.on('connect', () => {
      this.logger.log('Conectado al broker MQTT');
      this.subscribeToTopics();
    });

    this.client.on('error', (error) => {
      this.logger.error('Error en cliente MQTT:', error);
    });

    this.client.on('reconnect', () => {
      this.logger.warn('Reconectando al broker MQTT...');
    });

    this.client.on('message', async (topic, payload) => {
      await this.handleMessage(topic, payload);
    });
  }

  private subscribeToTopics() {
    const topic = 'imox/devices/+/telemetry';
    this.client.subscribe(topic, (err) => {
      if (err) {
        this.logger.error(`Error suscribiéndose a ${topic}:`, err);
      } else {
        this.logger.log(`Suscrito a: ${topic}`);
      }
    });
  }

  private async handleMessage(topic: string, payload: Buffer) {
    try {
      const rawData = JSON.parse(payload.toString());
      const iotId = this.extractIotIdFromTopic(topic);

      const data = plainToInstance(MqttTelemetryDto, rawData, {
        excludeExtraneousValues: true,
      });

      const errors = await validate(data);
      if (errors.length > 0) {
        this.logger.warn(
          `Datos inválidos recibidos de dispositivo ${iotId}: ${JSON.stringify(
            errors,
          )}`,
        );
        return;
      }

      this.logger.debug(`Mensaje recibido de dispositivo ${iotId}`);

      const device = await this.prismaMysql.iot.findUnique({
        where: { id: iotId },
      });

      if (!device) {
        this.logger.warn(`Dispositivo ${iotId} no encontrado`);
        return;
      }

      if (device.status === 0) {
        this.logger.warn(`Dispositivo ${iotId} está inactivo`);
        return;
      }

      await this.prismaMysql.iot.update({
        where: { id: iotId },
        data: {
          last_connection: new Date(),
          is_online: true,
        },
      });

      // Cachear en Redis para acceso rápido
      await this.redisService.setTelemetryLast(iotId, data);

      // Persistir en InfluxDB para historial de largo plazo
      try {
        await this.influxService.writeTelemetryPoint(iotId, data);
      } catch (influxError) {
        this.logger.error(
          `Error escribiendo a InfluxDB para dispositivo ${iotId}:`,
          influxError,
        );
        // No lanzamos el error para no interrumpir el flujo principal
      }

      const baseline = await this.redisService.getBaseline(iotId);

      const isBaselineValid = baseline?.electricas;

      const anomalyResult: any = isBaselineValid
        ? this.spikeDetector.detectAnomaly(data, baseline)
        : { isCritical: false, type: 'NONE' };

      if (anomalyResult.isCritical) {
        this.logger.warn(
          `Anomalía en dispositivo ${iotId} (${anomalyResult.type}): ${anomalyResult.message}`,
        );

        data.anomaly_type = anomalyResult.type;

        await this.redisService.pushCriticalEvent(iotId, data);
      } else {
        await this.redisService.setBaseline(iotId, data);
      }

      if (!baseline) {
        await this.redisService.setBaseline(iotId, data);
      }

      this.telemetryGateway.broadcastTelemetry(
        iotId,
        toTelemetryResponse(data, anomalyResult.isCritical, anomalyResult.type),
      );
    } catch (error) {
      this.logger.error('Error procesando mensaje MQTT:', error);
    }
  }

  private extractIotIdFromTopic(topic: string): number {
    const parts = topic.split('/');
    return Number.parseInt(parts[2], 10);
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.end();
      this.logger.log('Cliente MQTT desconectado');
    }
  }
}
