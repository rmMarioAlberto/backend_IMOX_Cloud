import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
  WsException,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseFilters } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '../auth/jwt.service';
import { MariaDbService } from '../database/mariadb.service';
import { TelemetryRedisService } from '../database/telemetry/telemetry-redis.service';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { TelemetryResponseDto } from './dto/telemetry-response.dto';
import { toTelemetryResponse } from './utils/telemetry.mapper';
import { WsExceptionsFilter } from '../../common/filters/ws-exceptions.filter';

@WebSocketGateway({
  cors: {
    origin: '*',
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

  constructor(
    private readonly jwtService: JwtService,
    private readonly prismaMysql: MariaDbService,
    private readonly redisService: TelemetryRedisService,
    private readonly telemetryInfluxService: TelemetryInfluxService,
    private readonly authRedisService: AuthRedisService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * @description Método que se ejecuta cuando un cliente se conecta
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
   * @description Método que se ejecuta cuando un cliente se desconecta
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  /**
   * @description Método que se encarga de suscribirse a los tópicos de MQTT
   */
  @SubscribeMessage('subscribeToDevice')
  async handleSubscribeToDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { iotId: number },
  ) {
    try {
      return await this.subscribeLogic(client, data);
    } catch (error) {
      new WsExceptionsFilter(this.configService).catch(error, {
        switchToWs: () => ({
          getClient: () => client,
          getData: () => data,
        }),
      } as any);
    }
  }

  /**
   * @description Método que se encarga de suscribirse a los tópicos de MQTT
   */
  private async subscribeLogic(client: Socket, data: { iotId: number }) {
    const iotId = data.iotId;
    if (!iotId) {
      throw new WsException({
        message: 'iotId is required',
        errorCode: 'INVALID_DATA',
      });
    }

    const user = client.data.user;
    if (!user) {
      throw new WsException({
        message: 'Unauthorized',
        errorCode: 'UNAUTHORIZED',
      });
    }

    const device = await this.prismaMysql.iot.findUnique({
      where: { id: iotId },
      select: { user_id: true },
    });

    if (!device) {
      throw new WsException({
        message: 'Device not found',
        errorCode: 'NOT_FOUND',
      });
    }

    // Allow access if user owns the device OR if user is admin (optional, sticking to owner for now based on previous code)
    const isOwner = device.user_id === user.sub;

    if (!isOwner) {
      this.logger.warn(
        `Acceso denegado: Usuario ${user.sub} intentó suscribirse a dispositivo ${iotId}`,
      );
      throw new WsException({
        message: 'Forbidden: You do not own this device',
        errorCode: 'FORBIDDEN',
      });
    }

    const roomName = `device:${iotId}`;
    client.join(roomName);

    let lastTelemetry: TelemetryResponseDto | null = null;
    const redisData = await this.redisService.getTelemetryLast(iotId);

    if (redisData) {
      lastTelemetry = toTelemetryResponse(
        redisData,
        false,
        redisData.anomaly_type,
      );
    } else {
      // Fallback to InfluxDB if not in Redis
      const influxData =
        await this.telemetryInfluxService.queryLatestTelemetry(iotId);

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
   * @description Método que se encarga de desuscribirse de los tópicos de MQTT
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
   * @description Método que se encarga de transmitir los datos de telemetría a los clientes suscritos
   */
  broadcastTelemetry(iotId: number, data: TelemetryResponseDto) {
    this.server.to(`device:${iotId}`).emit('telemetry', data);
  }
}
