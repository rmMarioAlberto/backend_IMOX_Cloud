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
      const diffMs = stopD.getTime() - startD.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffHours / 24;

      let window = '5m';
      if (diffDays > 7) {
        window = '6h';
      } else if (diffDays > 2) {
        window = '1h';
      } else if (diffHours > 12) {
        window = '15m';
      }

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

      const data = this.applyDeadband(combined, window);

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
   * @description Convierte una fila de InfluxDB a un punto de gráfica
   */
  private toDataPoint(r: any): any[] {
    return [
      r._time,
      Number((r.voltaje_v ?? 0).toFixed(2)),
      Number((r.corriente_a ?? 0).toFixed(2)),
      Number((r.potencia_w ?? 0).toFixed(2)),
      Number((r.energia_kwh ?? 0).toFixed(2)),
      r.anomaly_type || 'NONE',
    ];
  }

  /**
   * Aplica un filtro de suavizado (deadband) a la serie de telemetría para optimizar almacenamiento.
   *
   * @param combined Datos combinados de telemetría
   * @param window Ventana de agregación utilizada
   */
  private applyDeadband(combined: any[], window: string): any[][] {
    const data: any[][] = [];
    let lastSavedPoint: any[] | null = null;

    for (let i = 0; i < combined.length; i++) {
      const r = combined[i];
      if (r.voltaje_v === undefined && r.corriente_a === undefined) continue;

      const anomaly: string = r.anomaly_type || 'NONE';
      const currentPoint = this.toDataPoint(r);

      // Siempre incluir anomalías y puntos extremos de la serie
      if (this.isEssentialPoint(anomaly, i, combined.length)) {
        data.push(currentPoint);
        lastSavedPoint = currentPoint;
        continue;
      }

      const inclusion = this.evaluatePointInclusion(
        currentPoint,
        lastSavedPoint,
        window,
        combined[i - 1],
      );

      if (inclusion.shouldInclude) {
        if (inclusion.prevPoint) data.push(inclusion.prevPoint);
        data.push(currentPoint);
        lastSavedPoint = currentPoint;
      }
    }

    return data;
  }

  /**
   * Determina si un punto es esencial (anomalía o extremo).
   *
   * @param anomaly Tipo de anomalía
   * @param index Índice actual
   * @param total Total de puntos
   */
  private isEssentialPoint(
    anomaly: string,
    index: number,
    total: number,
  ): boolean {
    return anomaly !== 'NONE' || index === 0 || index === total - 1;
  }

  /**
   * Evalúa si un punto debe ser incluido basado en la ventana y fluctuaciones.
   *
   * @param current Punto actual
   * @param last Último punto guardado
   * @param window Ventana de agregación
   * @param prevRaw Punto anterior sin procesar
   */
  private evaluatePointInclusion(
    current: any[],
    last: any[] | null,
    window: string,
    prevRaw: any,
  ): { shouldInclude: boolean; prevPoint?: any[] } {
    if (!last) return { shouldInclude: true };

    if (window === '5m' || window === '15m') {
      if (this.checkFluctuation(current, last)) {
        const prevPoint =
          prevRaw && last[0] !== prevRaw._time
            ? this.toDataPoint(prevRaw)
            : undefined;
        return { shouldInclude: true, prevPoint };
      }
      return { shouldInclude: false };
    }

    return { shouldInclude: last[0] !== current[0] };
  }

  /**
   * Verifica si existe un cambio significativo entre dos puntos de telemetría.
   *
   * @param current Punto actual
   * @param last Último punto guardado
   * @returns Verdadero si el cambio es significativo (Deadband)
   */
  private checkFluctuation(current: any[], last: any[]): boolean {
    const vDiff = Math.abs((current[1] as number) - (last[1] as number));
    const cDiff = Math.abs((current[2] as number) - (last[2] as number));
    const pDiff = Math.abs((current[3] as number) - (last[3] as number));
    const timeDiff =
      new Date(current[0] as string).getTime() -
      new Date(last[0] as string).getTime();

    const isFluctuation = vDiff > 0.5 || cDiff > 0.1 || pDiff > 5;
    const maxTimeExceeded = timeDiff > 1000 * 60 * 60; // 1 hora

    return isFluctuation || maxTimeExceeded;
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
