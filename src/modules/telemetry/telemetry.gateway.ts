import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '../auth/jwt.service';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { RedisService } from '../redis/redis.service';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';
import { TelemetryResponseDto } from './dto/telemetry-response.dto';
import { toTelemetryResponse } from './utils/telemetry.mapper';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'telemetry',
})
export class TelemetryGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(TelemetryGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly prismaMysql: PrismaMysqlService,
    private readonly redisService: RedisService,
    private readonly prismaMongo: PrismaMongoService,
  ) {}

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

      const payload = await this.jwtService.verifyToken(token);

      client.data.user = payload;

      this.logger.log(`Cliente conectado: ${client.id} (User: ${payload.sub})`);
    } catch (error) {
      this.logger.error(`Error de autenticación WebSocket: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('subscribeToDevice')
  async handleSubscribeToDevice(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { iotId: number },
  ) {
    const iotId = data.iotId;
    if (!iotId) return;

    try {
      const user = client.data.user;
      if (!user) {
        client.emit('error', { message: 'Unauthorized' });
        return;
      }

      const device = await this.prismaMysql.iot.findUnique({
        where: { id: iotId },
        select: { user_id: true },
      });

      if (!device) {
        client.emit('error', { message: 'Device not found' });
        return;
      }

      const isOwner = device.user_id === user.sub;

      if (!isOwner) {
        this.logger.warn(
          `Acceso denegado: Usuario ${user.sub} intentó suscribirse a dispositivo ${iotId}`,
        );
        client.emit('exception', {
          status: 'error',
          message: 'Forbidden: You do not own this device',
        });
        return;
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
      } else if (device.user_id) {
        const mongoTelemetry = await this.prismaMongo.telemetry.findUnique({
          where: {
            iotId_userId: {
              iotId: iotId,
              userId: device.user_id,
            },
          },
        });

        if (mongoTelemetry && mongoTelemetry.readings.length > 0) {
          const lastReading = mongoTelemetry.readings.at(-1);
          if (lastReading) {
            const mqttDto = {
              electricas: lastReading.electricas,
              diagnostico: lastReading.diagnostico,
              timestamp: lastReading.timestamp.toISOString(),
            } as any;

            lastTelemetry = toTelemetryResponse(
              mqttDto,
              lastReading.type === 'critical',
              lastReading.anomaly_type as
                | 'SPIKE'
                | 'LIMIT'
                | 'NONE'
                | undefined,
            );
          }
        }
      }

      if (lastTelemetry) {
        client.emit('telemetry', lastTelemetry);
      }

      return { event: 'subscribed', data: { room: roomName } };
    } catch (error) {
      this.logger.error(`Error en suscripción: ${error.message}`);
      client.emit('error', { message: 'Internal Server Error' });
    }
  }

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

  broadcastTelemetry(iotId: number, data: TelemetryResponseDto) {
    this.server.to(`device:${iotId}`).emit('telemetry', data);
  }
}
