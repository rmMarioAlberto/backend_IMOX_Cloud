import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  createIotDto,
  linkIotUserDto,
  responseIotDto,
  responseLinkIotUserDto,
  softResetIotDto,
  responseSoftResetIotDto,
  ResponseHistoryLightweightDto,
} from './dto/iot.dto';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { plainToInstance } from 'class-transformer';
import crypto from 'crypto';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';

@Injectable()
export class IotService {
  constructor(
    private readonly prismaMysql: PrismaMysqlService,
    private readonly prismaMongo: PrismaMongoService,
  ) {}

  async createIot(createIotDto: createIotDto): Promise<responseIotDto> {
    const { macAddress } = createIotDto;

    const deviceSecret = crypto.randomBytes(24).toString('hex');

    const checkIot = await this.prismaMysql.iot.findUnique({
      where: {
        mac_address: macAddress,
      },
    });

    if (checkIot) {
      throw new BadRequestException('Device already exists');
    }

    const iot = await this.prismaMysql.iot.create({
      data: {
        mac_address: macAddress,
        device_secret: deviceSecret,
        status: 1,
      },
    });

    return plainToInstance(responseIotDto, iot);
  }

  async linkIotUser(
    linkIotUserDto: linkIotUserDto,
  ): Promise<responseLinkIotUserDto> {
    const { userId, macAddress } = linkIotUserDto;

    const checkIot = await this.prismaMysql.iot.findUnique({
      where: {
        mac_address: macAddress,
      },
    });

    if (!checkIot || checkIot.status == 0) {
      throw new BadRequestException('Device not found');
    }

    if (checkIot.user_id) {
      throw new ConflictException({
        message: 'Este dispositivo ya está vinculado a otra cuenta',
        errorCode: 'IOT_ALREADY_LINKED',
      });
    }

    await this.prismaMysql.iot.update({
      where: {
        mac_address: macAddress,
      },
      data: {
        user_id: userId,
      },
    });

    return {
      message: 'IOT linked successfully',
    };
  }

  async softResetIot(
    softResetIotDto: softResetIotDto,
  ): Promise<responseSoftResetIotDto> {
    const { macAddress, userId } = softResetIotDto;

    const iot = await this.prismaMysql.iot.findUnique({
      where: { mac_address: macAddress },
    });

    if (!iot || iot.status == 0) {
      throw new BadRequestException('Divice not fount');
    }

    if (!iot.user_id) {
      throw new BadRequestException(
        'The device does not have an assigned user.',
      );
    }

    await this.prismaMongo.telemetry.deleteMany({
      where: { iotId: iot.id, userId: iot.user_id },
    });

    await this.prismaMysql.iot.update({
      where: { id: iot.id },
      data: { user_id: userId },
    });

    return {
      message: 'IOT soft reset successfully',
    };
  }

  async getDeviceHistory(
    iotId: number,
    userId: number,
    startDate: string,
    endDate: string,
  ): Promise<ResponseHistoryLightweightDto> {
    // 1. Validar ownership en MySQL
    const device = await this.prismaMysql.iot.findUnique({
      where: { id: iotId },
    });

    if (!device) {
      throw new BadRequestException('Device not found');
    }

    // Permitir si es el dueño O si es admin (roles se manejan en guards, aquí asumimos que ya pasó auth)
    // Pero necesitamos validar que el usuario que pide sea el dueño si no es admin.
    // Como el controller pasará el userId del token, validamos aquí:
    if (device.user_id !== userId) {
      // TODO: Si implementamos roles, checar si es admin. Por ahora estricto dueño.
      throw new ConflictException('You do not own this device');
    }

    // 2. Buscar en MongoDB
    const start = new Date(startDate);
    const end = new Date(endDate);

    const mongoTelemetry = await this.prismaMongo.telemetry.findUnique({
      where: {
        iotId_userId: {
          iotId: device.id,
          userId: device.user_id,
        },
      },
    });

    // Definir columnas fijas
    const columns = [
      'timestamp',
      'voltaje',
      'corriente',
      'potencia',
      'energia',
    ];

    if (!mongoTelemetry || !mongoTelemetry.readings) {
      return {
        columns,
        data: [],
      };
    }

    // 3. Filtrar y Mapear en memoria para formato Lightweight (Columnar)

    const data = mongoTelemetry.readings
      .filter((r) => r.timestamp >= start && r.timestamp <= end)
      .map((r) => [
        r.timestamp, // timestamp
        r.electricas.voltaje_v, // voltaje
        r.electricas.corriente_a, // corriente
        r.electricas.potencia_w, // potencia
        r.electricas.energia_kwh, // energia
      ]);

    return {
      columns,
      data,
    };
  }
}
