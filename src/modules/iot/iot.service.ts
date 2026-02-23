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
      const diffMs = stopD.getTime() - startD.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);
      const diffDays = diffHours / 24;

      let window = '5m';
      if (diffDays > 7) {
        window = '6h'; // Para periodos largos (ej. 30 días), 6 horas
      } else if (diffDays > 2) {
        window = '1h'; // Menos de 7 días pero más de 2: 1 hora
      } else if (diffHours > 12) {
        window = '15m'; // Hasta 2 días
      }

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

      // Transformar y aplicar un leve filtro Deadband final
      const data: any[][] = [];
      let lastSavedPoint: any[] | null = null;

      for (let i = 0; i < combined.length; i++) {
        const r = combined[i];

        // Ignorar filas donde la agregación resultó nula o vacía
        if (r.voltaje_v === undefined && r.corriente_a === undefined) continue;

        const anomaly = r.anomaly_type || 'NONE';

        const currentPoint = [
          r._time,
          Number((r.voltaje_v ?? 0).toFixed(2)),
          Number((r.corriente_a ?? 0).toFixed(2)),
          Number((r.potencia_w ?? 0).toFixed(2)),
          Number((r.energia_kwh ?? 0).toFixed(2)),
          anomaly,
        ];

        // Siempre incluir puntos de anomalías o primer/último punto de la serie completa no filtrada
        if (anomaly !== 'NONE' || i === 0 || i === combined.length - 1) {
          data.push(currentPoint);
          lastSavedPoint = currentPoint;
          continue;
        }

        // Si es un periodo corto, aplicamos un deadband suave adicional para ahorrar cientos de puntos rectos
        if (lastSavedPoint && (window === '5m' || window === '15m')) {
          const vDiff = Math.abs(
            (currentPoint[1] as number) - (lastSavedPoint[1] as number),
          );
          const cDiff = Math.abs(
            (currentPoint[2] as number) - (lastSavedPoint[2] as number),
          );
          const pDiff = Math.abs(
            (currentPoint[3] as number) - (lastSavedPoint[3] as number),
          );
          const timeDiff =
            new Date(currentPoint[0] as string).getTime() -
            new Date(lastSavedPoint[0] as string).getTime();

          // Umbrales para suavizado final: > 0.5V, > 0.1A, > 5W
          const isFluctuation = vDiff > 0.5 || cDiff > 0.1 || pDiff > 5.0;
          const maxTimeExceeded = timeDiff > 1000 * 60 * 60; // 1 hora máximo sin punto

          if (isFluctuation || maxTimeExceeded) {
            // Guardar el prevRow para que la línea no sea un triángulo enorme
            const prevRow = combined[i - 1];
            if (
              prevRow &&
              lastSavedPoint &&
              lastSavedPoint[0] !== prevRow._time
            ) {
              data.push([
                prevRow._time,
                Number((prevRow.voltaje_v ?? 0).toFixed(2)),
                Number((prevRow.corriente_a ?? 0).toFixed(2)),
                Number((prevRow.potencia_w ?? 0).toFixed(2)),
                Number((prevRow.energia_kwh ?? 0).toFixed(2)),
                prevRow.anomaly_type || 'NONE',
              ]);
            }
            data.push(currentPoint);
            lastSavedPoint = currentPoint;
          }
        } else {
          // Si la ventana ya es grande (1h o 6h), incluimos cada punto agrupado sin importar deadband
          // evitando duplicados de tiempo que puedan cruzarse de las dos queries
          if (lastSavedPoint && lastSavedPoint[0] === currentPoint[0]) {
            continue;
          }
          data.push(currentPoint);
          lastSavedPoint = currentPoint;
        }
      }

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
  private async deleteTelemetryData(iotId: number): Promise<void> {
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
