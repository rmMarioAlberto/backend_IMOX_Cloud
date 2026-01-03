import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import {
  createIotDto,
  linkIotUserDto,
  responseIotDto,
  softResetIotDto,
  ResponseHistoryLightweightDto,
  GetHistoryDto,
} from './dto/iot.dto';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import { responseMessage } from '../../common/utils/dto/utils.dto';
import { plainToInstance } from 'class-transformer';
import crypto from 'crypto';
import { PrismaMongoService } from '../prisma/prisma-mongo.service';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class IotService {
  constructor(
    private readonly prismaMysql: PrismaMysqlService,
    private readonly prismaMongo: PrismaMongoService,
  ) {}

  async createIot(createIotDto: createIotDto): Promise<responseIotDto> {
    const { macAddress } = createIotDto;

    const deviceSecret = crypto.randomBytes(24).toString('hex');
    const hashedSecret = await bcrypt.hash(deviceSecret, 10);

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
        device_secret: hashedSecret,
        status: 1,
      },
    });

    return plainToInstance(responseIotDto, {
      ...iot,
      device_secret: deviceSecret,
    });
  }

  async linkIotUser(
    linkIotUserDto: linkIotUserDto,
    user: UserPayloadDto,
  ): Promise<responseMessage> {
    const { macAddress } = linkIotUserDto;
    const { id } = user;

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
        user_id: id,
      },
    });

    return {
      message: 'IOT linked successfully',
    };
  }

  async softResetIot(
    softResetIotDto: softResetIotDto,
    user: UserPayloadDto,
  ): Promise<responseMessage> {
    const { macAddress } = softResetIotDto;
    const { id } = user;
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
      data: { user_id: id },
    });

    return {
      message: 'IOT soft reset successfully',
    };
  }

  async getDeviceHistory(
    dto: GetHistoryDto,
    user: UserPayloadDto,
  ): Promise<ResponseHistoryLightweightDto> {
    const { startDate, endDate, iotId } = dto;
    const { id } = user;

    const device = await this.prismaMysql.iot.findUnique({
      where: { id: iotId },
    });

    if (!device) {
      throw new BadRequestException('Device not found');
    }

    if (device.user_id !== id) {
      throw new ConflictException('You do not own this device');
    }

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

    const data = mongoTelemetry.readings
      .filter((r) => r.timestamp >= start && r.timestamp <= end)
      .map((r) => [
        r.timestamp,
        r.electricas.voltaje_v,
        r.electricas.corriente_a,
        r.electricas.potencia_w,
        r.electricas.energia_kwh,
      ]);

    return {
      columns,
      data,
    };
  }
}
