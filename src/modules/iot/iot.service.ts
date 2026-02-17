import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  CreateIotDto,
  LinkIotUserDto,
  ResponseHistoryLightweightDto,
  GetHistoryDto,
  IotDeviceDto,
  ResponseIotListDto,
  ResponseIotDto,
} from './dto/iot.dto';
import { MariaDbService } from '../database/mariadb.service';
import { plainToInstance } from 'class-transformer';
import crypto from 'node:crypto';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class IotService {
  constructor(
    private readonly prismaMysql: MariaDbService,
    private readonly telemetryInfluxService: TelemetryInfluxService,
  ) {}

  private readonly logger = new Logger(IotService.name);

  /**
   * Crear un nuevo dispositivo IoT
   * @param createIotDto
   * @returns Promise<ResponseIotDto>
   */
  async createIot(createIotDto: CreateIotDto): Promise<ResponseIotDto> {
    const { macAddress } = createIotDto;

    const deviceSecret = crypto.randomBytes(24).toString('hex');
    const hashedSecret = await bcrypt.hash(deviceSecret, 10);

    const checkIot = await this.prismaMysql.iot.findUnique({
      where: {
        mac_address: macAddress,
      },
    });

    if (checkIot) {
      throw new BadRequestException('El dispositivo ya existe');
    }

    const iot = await this.prismaMysql.iot.create({
      data: {
        mac_address: macAddress,
        device_secret: hashedSecret,
        status: 1,
      },
    });

    return plainToInstance(ResponseIotDto, {
      ...iot,
      device_secret: deviceSecret,
    });
  }

  /**
   * Vincular un dispositivo IoT a un usuario
   * @param linkIotUserDto
   * @param user
   * @returns Promise<void>
   */
  async linkIotUser(
    linkIotUserDto: LinkIotUserDto,
    user: UserPayloadDto,
  ): Promise<void> {
    const { macAddress } = linkIotUserDto;
    const { id } = user;

    const checkIot = await this.prismaMysql.iot.findUnique({
      where: {
        mac_address: macAddress,
      },
    });

    if (!checkIot || checkIot.status == 0) {
      throw new BadRequestException('Dispositivo no encontrado');
    }

    // Si ya tiene un usuario vinculado, hacer soft reset (borrar telemetría)
    if (checkIot.user_id) {
      await this.deleteTelemetryData(checkIot.id);
    }

    await this.prismaMysql.iot.update({
      where: {
        mac_address: macAddress,
      },
      data: {
        user_id: id,
      },
    });
  }

  /**
   * Obtiene la lista de dispositivos IoT vinculados a un usuario
   * @param user
   * @returns Promise<ResponseIotListDto>
   */
  async getIotsByUser(user: UserPayloadDto): Promise<ResponseIotListDto> {
    const { id } = user;

    const iots = await this.prismaMysql.iot.findMany({
      where: {
        user_id: id,
        status: 1,
      },
      select: {
        id: true,
        mac_address: true,
        status: true,
        created_at: true,
        updated_at: true,
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    const devices = plainToInstance(IotDeviceDto, iots);

    return { devices };
  }

  /**
   * Obtiene la lista de datos de telemetría de un dispositivo IoT
   * @param dto
   * @param user
   * @returns Promise<ResponseHistoryLightweightDto>
   */
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
      this.logger.error(
        `Error querying InfluxDB for device ${iotId}: ${error}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Si hay error consultando InfluxDB, devolver datos vacíos
      return {
        columns,
        data: [],
      };
    }
  }

  /**
   * Elimina los datos de telemetría de un dispositivo IoT
   * @param iotId
   * @returns Promise<void>
   */
  private async deleteTelemetryData(iotId: number): Promise<void> {
    try {
      await this.telemetryInfluxService.deleteTelemetryByIotId(iotId);
      this.logger.log(`Telemetry data deleted for device ${iotId}`);
    } catch (error) {
      this.logger.error(
        `Failed to delete telemetry for device ${iotId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
