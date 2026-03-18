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
import { MqttTelemetryDto, MqttHistoryRequestDto } from './dto/mqtt.dto';
import { toTelemetryResponse } from '../telemetry/utils/telemetry.mapper';
import { DeadbandUtil } from '../telemetry/utils/deadband.util';

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

  /**
   * Conecta el cliente al broker MQTT usando las credenciales configuradas.
   */
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

  /**
   * Suscribe el cliente a los tópicos de telemetría y peticiones de historial.
   */
  private subscribeToTopics() {
    const telemetryTopic = 'imox/devices/+/telemetry';
    const historyTopic = 'imox/devices/+/history/request';

    this.client.subscribe(telemetryTopic, (err) => {
      if (err) {
        this.logger.error(`Error suscribiéndose a ${telemetryTopic}:`, err);
      } else {
        this.logger.log(`Suscrito a: ${telemetryTopic}`);
      }
    });

    this.client.subscribe(historyTopic, (err) => {
      if (err) {
        this.logger.error(`Error suscribiéndose a ${historyTopic}:`, err);
      } else {
        this.logger.log(`Suscrito a: ${historyTopic}`);
      }
    });
  }

  /**
   * Despacha los mensajes recibidos al manejador correspondiente según el tópico.
   */
  private async handleMessage(topic: string, payload: Buffer) {
    if (topic.endsWith('/telemetry')) {
      await this.handleTelemetry(topic, payload);
    } else if (topic.endsWith('/history/request')) {
      await this.handleHistoryRequest(topic, payload);
    }
  }

  /**
   * @description Procesa los mensajes de telemetría en tiempo real enviados por el dispositivo
   */
  private async handleTelemetry(topic: string, payload: Buffer) {
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

  /**
   * @description Atiende una petición de historial de un dispositivo IoT.
   * El dispositivo publica { startDate, endDate } en imox/devices/{id}/history/request
   * y el backend responde en imox/devices/{id}/history/response con los datos comprimidos.
   * La agregación por ventana temporal + filtro deadband garantiza que no se envían
   * miles de puntos, sino solo los significativos.
   */
  private async handleHistoryRequest(topic: string, payload: Buffer) {
    const iotId = this.extractIotIdFromTopic(topic);
    const responseTopic = `imox/devices/${iotId}/history/response`;

    try {
      const rawData = JSON.parse(payload.toString());
      const dto = plainToInstance(MqttHistoryRequestDto, rawData, {
        excludeExtraneousValues: true,
      });

      const errors = await validate(dto);
      if (errors.length > 0) {
        this.logger.warn(
          `Petición de historial inválida del dispositivo ${iotId}: ${JSON.stringify(errors)}`,
        );
        this.publish(responseTopic, { error: 'Parámetros inválidos' });
        return;
      }

      const startD = new Date(dto.startDate);
      const stopD = new Date(dto.endDate);
      const startIso = startD.toISOString();
      const stopIso = stopD.toISOString();

      // Determinar ventana de agregación según el rango solicitado (igual que en IotService)
      const window = DeadbandUtil.calculateAggregationWindow(startD, stopD);

      const [aggregatedResults, anomalyResults] = await Promise.all([
        this.influxService.queryAggregatedTelemetry(
          iotId,
          startIso,
          stopIso,
          window,
        ),
        this.influxService.queryAnomaliesRange(iotId, startIso, stopIso),
      ]);

      const columns = [
        'timestamp',
        'voltaje',
        'corriente',
        'potencia',
        'energia',
        'anomalia',
      ];

      if (aggregatedResults.length === 0 && anomalyResults.length === 0) {
        this.publish(responseTopic, { columns, data: [] });
        return;
      }

      const combined = [...aggregatedResults, ...anomalyResults].sort(
        (a, b) => new Date(a._time).getTime() - new Date(b._time).getTime(),
      );

      const data = DeadbandUtil.applyDeadband(combined, window);

      this.logger.debug(
        `Historial para dispositivo ${iotId}: ${data.length} puntos (ventana: ${window})`,
      );

      this.publish(responseTopic, { columns, data });
    } catch (error) {
      this.logger.error(
        `Error procesando historial para dispositivo ${iotId}:`,
        error,
      );
      this.publish(responseTopic, {
        error: 'Error interno al consultar historial',
      });
    }
  }

  /**
   * @description Publica un mensaje JSON en un tópico MQTT
   */
  private publish(topic: string, payload: object): void {
    this.client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
      if (err) {
        this.logger.error(`Error publicando en ${topic}:`, err);
      }
    });
  }



  /**
   * Extrae el ID del dispositivo IoT a partir del tópico MQTT.
   */
  private extractIotIdFromTopic(topic: string): number {
    const parts = topic.split('/');
    return Number.parseInt(parts[2], 10);
  }

  /**
   * Ejecuta tareas de limpieza cuando el módulo se destruye.
   */
  async onModuleDestroy() {
    if (this.client) {
      this.client.end();
      this.logger.log('Cliente MQTT desconectado');
    }
  }
}
