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
import { MariaDbService } from '../database/mariadb.service';
import { responseMessage } from '../../common/utils/dto/utils.dto';
import { plainToInstance } from 'class-transformer';
import crypto from 'crypto';
import { InfluxDbService } from '../database/influxdb.service';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class IotService {
  constructor(
    private readonly prismaMysql: MariaDbService,
    private readonly influxDbService: InfluxDbService,
    private readonly telemetryInfluxService: TelemetryInfluxService,
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

    // Eliminar datos de telemetría del dispositivo en InfluxDB
    await this.deleteTelemetryData(iot.id);

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

    // Verificar que el dispositivo existe y pertenece al usuario
    const device = await this.prismaMysql.iot.findUnique({
      where: { id: iotId },
    });

    if (!device) {
      throw new BadRequestException('Device not found');
    }

    if (device.user_id !== id) {
      throw new ConflictException('You do not own this device');
    }

    // Convertir fechas a formato RFC3339 para InfluxDB
    const start = new Date(startDate).toISOString();
    const stop = new Date(endDate).toISOString();

    const columns = [
      'timestamp',
      'voltaje',
      'corriente',
      'potencia',
      'energia',
    ];

    try {
      // Consultar datos de InfluxDB
      const influxResults =
        await this.telemetryInfluxService.queryTelemetryRange(
          iotId,
          start,
          stop,
        );

      if (!influxResults || influxResults.length === 0) {
        return {
          columns,
          data: [],
        };
      }

      // Transformar resultados de InfluxDB al formato esperado
      const data = influxResults.map((r) => [
        r._time,
        r.voltaje_v ?? 0,
        r.corriente_a ?? 0,
        r.potencia_w ?? 0,
        r.energia_kwh ?? 0,
      ]);

      return {
        columns,
        data,
      };
    } catch (error) {
      // Si hay error consultando InfluxDB, devolver datos vacíos
      return {
        columns,
        data: [],
      };
    }
  }

  /**
   * Eliminar todos los datos de telemetría de un dispositivo
   * Utilizado durante el soft reset
   *
   * Nota: InfluxDB v2 delete API requiere configuración adicional.
   * Por ahora se registra la solicitud para implementación futura.
   */
  private async deleteTelemetryData(iotId: number): Promise<void> {
    // TODO: Implementar eliminación real usando InfluxDB DeleteAPI
    // La API de eliminación requiere acceso HTTP directo al endpoint:
    // POST /api/v2/delete?org=<org>&bucket=<bucket>
    // Con body: { "start": "1970-01-01T00:00:00Z", "stop": "now", "predicate": "iot_id=\"1\"" }

    console.log(
      `[IoT Service] Telemetry deletion requested for iotId ${iotId}. ` +
        `Full implementation pending - consider implementing via HTTP DeleteAPI.`,
    );
  }
}
