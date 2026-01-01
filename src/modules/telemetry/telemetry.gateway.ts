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
      // 1. Obtener token de headers, auth payload o query string
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Cliente ${client.id} intentó conectar sin token`);
        client.disconnect();
        return;
      }

      // 2. Verificar token
      const payload = await this.jwtService.verifyToken(token);

      // 3. Guardar info de usuario en el socket
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

      // Validar propiedad del dispositivo
      const device = await this.prismaMysql.iot.findUnique({
        where: { id: iotId },
        select: { user_id: true },
      });

      if (!device) {
        client.emit('error', { message: 'Device not found' });
        return;
      }

      // Permitir si es el dueño (user_id match) O si es ADMIN (role === 1)
      const isOwner = device.user_id === user.sub;
      const isAdmin = user.role === 1;

      if (!isOwner && !isAdmin) {
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
      this.logger.debug(
        `Cliente ${client.id} (User ${user.sub}) suscrito a ${roomName}`,
      );

      // --- Enviar Estada Inicial (Last Known Value) ---
      // 1. Intentar desde Redis (Más rápido)
      let lastTelemetry = await this.redisService.getTelemetryLast(iotId);

      // 2. Fallback a MongoDB si no hay en Redis
      if (!lastTelemetry && device.user_id) {
        this.logger.debug(`Redis vacío para ${iotId}, buscando en MongoDB...`);
        const mongoTelemetry = await this.prismaMongo.telemetry.findUnique({
          where: {
            iotId_userId: {
              iotId: iotId,
              userId: device.user_id,
            },
          },
        });

        if (mongoTelemetry && mongoTelemetry.readings.length > 0) {
          // Obtener la lectura más reciente (asumiendo que se guardan en orden o buscar la última)
          // Nota: Array.at(-1) es la última insertada
          const lastReading = mongoTelemetry.readings.at(-1);
          if (lastReading) {
            lastTelemetry = {
              ...lastReading.electricas,
              is_critical: lastReading.type === 'critical',
              timestamp: lastReading.timestamp.toISOString(),
              // Mapear otros campos si es necesario
            } as any;
          }
        }
      }

      if (lastTelemetry) {
        this.logger.debug(
          `Enviando estado inicial (LKV) a cliente ${client.id} para dispositivo ${iotId}`,
        );
        client.emit('telemetry', lastTelemetry);
      } else {
        this.logger.debug(
          `No hay historial disponible para dispositivo ${iotId} (Redis ni MongoDB)`,
        );
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

  /**
   * Método para emitir datos de telemetría a una sala específica
   * Se llama desde MqttService
   */
  broadcastTelemetry(iotId: number, data: any) {
    this.server.to(`device:${iotId}`).emit('telemetry', data);
  }
}
