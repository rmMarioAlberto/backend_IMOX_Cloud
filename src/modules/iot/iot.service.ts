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
import * as crypto from 'node:crypto';
import { TelemetryInfluxService } from '../database/telemetry/telemetry-influx.service';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import * as bcrypt from 'bcrypt';
import { DeadbandUtil } from '../telemetry/utils/deadband.util';

@Injectable()
export class IotService {
  private readonly logger = new Logger(IotService.name);

  constructor(
    private readonly prismaMysql: MariaDbService,
    private readonly telemetryInfluxService: TelemetryInfluxService,
  ) {}

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
   * Vincular un dispositivo IoT a un usuario (Autenticado por el propio IoT)
   * @param linkIotUserDto DTO con MAC, Device Secret y User ID
   * @returns Promise<void>
   */
  async linkIotUser(linkIotUserDto: LinkIotUserDto): Promise<void> {
    const { macAddress, deviceSecret, userId } = linkIotUserDto;

    const checkIot = await this.prismaMysql.iot.findUnique({
      where: {
        mac_address: macAddress,
      },
    });

    if (!checkIot || checkIot.status == 0) {
      throw new BadRequestException('Dispositivo no encontrado o inactivo');
    }

    // Validar de  que el secreto del dispositivo sea correcto
    const isSecretValid = await bcrypt.compare(
      deviceSecret,
      checkIot.device_secret,
    );

    if (!isSecretValid) {
      throw new BadRequestException('Credenciales del dispositivo inválidas');
    }

    // Si ya tiene un usuario vinculado y es distinto, hacer soft reset (borrar telemetría)
    if (checkIot.user_id && checkIot.user_id !== userId) {
      await this.deleteTelemetryData(checkIot.id);
    }

    await this.prismaMysql.iot.update({
      where: {
        mac_address: macAddress,
      },
      data: {
        user_id: userId,
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
      throw new BadRequestException('Dispositivo no encontrado');
    }

    if (device.user_id !== id) {
      throw new ConflictException('No eres el dueño de este dispositivo');
    }

    // Convertir fechas a formato RFC3339 para InfluxDB
    const startD = new Date(startDate);
    const stopD = new Date(endDate);
    const startIso = startD.toISOString();
    const stopIso = stopD.toISOString();

    const columns = [
      'timestamp',
      'voltaje',
      'corriente',
      'potencia',
      'energia',
      'anomalia',
    ];

    try {
      // Determinar la ventana temporal de agrupación en InfluxDB
      const window = DeadbandUtil.calculateAggregationWindow(startD, stopD);

      // Consultar promedios y anomalías en InfluxDB en paralelo
      const [aggregatedResults, anomalyResults] = await Promise.all([
        this.telemetryInfluxService.queryAggregatedTelemetry(
          iotId,
          startIso,
          stopIso,
          window,
        ),
        this.telemetryInfluxService.queryAnomaliesRange(
          iotId,
          startIso,
          stopIso,
        ),
      ]);

      if (aggregatedResults.length === 0 && anomalyResults.length === 0) {
        return {
          columns,
          data: [],
        };
      }

      // Combinar y ordenar ambos conjuntos de datos por timestamp
      const combined = [...aggregatedResults, ...anomalyResults].sort(
        (a, b) => new Date(a._time).getTime() - new Date(b._time).getTime(),
      );

      // Transformar y aplicar el filtro de suavizado (Deadband)
      const data = DeadbandUtil.applyDeadband(combined, window);

      return {
        columns,
        data,
      };
    } catch (error) {
      this.logger.error(
        `Error al consultar InfluxDB para el dispositivo ${iotId}: ${error}`,
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
  async deleteTelemetryData(iotId: number): Promise<void> {
    try {
      await this.telemetryInfluxService.deleteTelemetryByIotId(iotId);
      this.logger.log(
        `Datos de telemetría eliminados para el dispositivo ${iotId}`,
      );
    } catch (error) {
      this.logger.error(
        `Error al eliminar la telemetría para el dispositivo ${iotId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

}
