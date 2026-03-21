import { Logger, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { WsExceptionsFilter } from '../../common/filters/ws-exceptions.filter';
import { JwtService } from '../auth/jwt.service';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import { MariaDbService } from '../database/mariadb.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { TelemetryRedisService } from '../database/telemetry/telemetry-redis.service';
import { TelemetryResponseDto } from './dto/telemetry-response.dto';
import { toTelemetryResponse } from './utils/telemetry.mapper';

@WebSocketGateway({
  cors: {
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => TelemetryGateway.corsOriginFactory(origin, callback),
    credentials: true,
  },
  namespace: 'telemetry',
})
@UseFilters(WsExceptionsFilter)
export class TelemetryGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TelemetryGateway.name);

  static corsOriginFactory(
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void,
  ) {
    const corsOrigins = process.env.CORS_ORIGINS;
    if (!corsOrigins || corsOrigins === '*' || !origin) {
      return callback(null, true);
    }
    const allowed = corsOrigins.split(',').map((o) => o.trim());
    if (allowed.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error(`Origen WebSocket no permitido: ${origin}`));
  }

  constructor(
    private readonly jwtService: JwtService,
    private readonly prismaMysql: MariaDbService,
    private readonly redisService: TelemetryRedisService,
    private readonly telemetryInfluxService: TelemetryInfluxService,
    private readonly authRedisService: AuthRedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Maneja la conexión de un nuevo cliente WebSocket.
   * Verifica el token JWT y la lista negra de tokens.
   */
  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Cliente ${client.id} intentó conectar sin token`);
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAccessToken(token);

      // Check Blacklist
      const isBlacklisted =
        await this.authRedisService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        this.logger.warn(`Cliente ${client.id} intentó usar token revocado`);
        client.disconnect();
        return;
      }

      client.data.user = payload;

      this.logger.log(`Cliente conectado: ${client.id} (User: ${payload.sub})`);
    } catch (error) {
      this.logger.error(`Error de autenticación WebSocket: ${error.message}`);
      client.disconnect();
    }
  }

  /**
   * Maneja la desconexión de un cliente WebSocket.
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  /**
   * Maneja la suscripción de un cliente WebSocket a un dispositivo IoT específico.
   * Valida autenticación, propiedad del dispositivo y envía última telemetría disponible.
   */
  @SubscribeMessage('subscribeToDevice')
  async handleSubscribeToDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { iotId: number },
  ) {
    return await this.subscribeLogic(client, data);
  }

  private async subscribeLogic(client: Socket, data: { iotId: number }) {
    const iotId = data.iotId;
    if (!iotId) {
      throw new WsException({
        message: 'El campo iotId es requerido',
        errorCode: 'INVALID_DATA',
      });
    }

    const user = client.data.user;
    if (!user) {
      throw new WsException({
        message: 'No autenticado',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const device = await this.prismaMysql.iot.findUnique({
      where: { id: iotId },
      select: { user_id: true },
    });

    if (!device) {
      throw new WsException({
        message: 'Dispositivo no encontrado',
        errorCode: 'NOT_FOUND',
      });
    }

    // Verificar que el usuario es dueño del dispositivo
    const isOwner = device.user_id === user.sub;

    if (!isOwner) {
      this.logger.warn(
        `Acceso denegado: Usuario ${user.sub} intentó suscribirse a dispositivo ${iotId}`,
      );
      throw new WsException({
        message: 'Prohibido: No eres dueño de este dispositivo',
        errorCode: 'FORBIDDEN',
      });
    }

    const roomName = `device:${iotId}`;
    client.join(roomName);

    let lastTelemetry: TelemetryResponseDto | null = null;
    const redisData = await this.redisService.getTelemetryLast(iotId);

    if (redisData) {
      this.logger.debug(
        `[WS] Datos iniciales obtenidos de Redis para dispositivo ${iotId}`,
      );
      lastTelemetry = toTelemetryResponse(
        redisData,
        false,
        redisData.anomaly_type,
      );
    } else {
      this.logger.warn(
        `[WS] No hay datos en Redis para ${iotId}. Consultando InfluxDB como respaldo...`,
      );
      // Fallback to InfluxDB if not in Redis
      const influxData =
        await this.telemetryInfluxService.queryLatestTelemetry(iotId);

      this.logger.debug(
        `[WS] Resultado InfluxDB para dispositivo ${iotId}: ${JSON.stringify(influxData)}`,
      );

      if (influxData) {
        // Map InfluxDB result to TelemetryResponseDto
        // InfluxDB returns flat object: { _time, voltaje_v, ... }
        const mappedData = {
          electricas: {
            voltaje_v: influxData.voltaje_v,
            corriente_a: influxData.corriente_a,
            potencia_w: influxData.potencia_w,
            energia_kwh: influxData.energia_kwh,
            frecuencia_hz: influxData.frecuencia_hz,
            factor_potencia: influxData.factor_potencia,
          },
          diagnostico: {
            rssi_dbm: influxData.rssi_dbm,
            uptime_s: influxData.uptime_s,
            ip: influxData.ip,
            pzem_status: influxData.pzem_status,
          },
          timestamp: influxData._time,
          anomaly_type: influxData.anomaly_type,
        };

        lastTelemetry = toTelemetryResponse(
          mappedData as any,
          influxData.anomaly_type && influxData.anomaly_type !== 'NONE',
          influxData.anomaly_type,
        );
      }
    }

    if (lastTelemetry) {
      client.emit('telemetry', lastTelemetry);
    }

    return { event: 'subscribed', data: { room: roomName } };
  }

  /**
   * Maneja la dessuscripción de un cliente WebSocket de un dispositivo IoT.
   */
  @SubscribeMessage('unsubscribeFromDevice')
  handleUnsubscribeFromDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { iotId: number },
  ) {
    const iotId = data.iotId;
    if (!iotId) return;

    const roomName = `device:${iotId}`;
    client.leave(roomName);
    this.logger.debug(`Cliente ${client.id} desuscrito de ${roomName}`);

    return { event: 'unsubscribed', data: { room: roomName } };
  }

  /**
   * Transmite los datos de telemetría a los clientes suscritos a un dispositivo específico.
   *
   * @param iotId ID del dispositivo IoT
   * @param data Datos de telemetría procesados
   */
  broadcastTelemetry(iotId: number, data: TelemetryResponseDto) {
    this.server.to(`device:${iotId}`).emit('telemetry', data);
  }
}
