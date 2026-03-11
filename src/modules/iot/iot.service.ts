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
      const window = this.calculateAggregationWindow(startD, stopD);

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
      const data = this.applyHistoryDeadband(combined, window);

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

  /**
   * Calcula la ventana de agregación de InfluxDB según el rango de tiempo.
   *
   * @param startD Fecha de inicio
   * @param stopD Fecha final
   * @returns Ventana de agregación (ej. '5m', '1h')
   */
  private calculateAggregationWindow(startD: Date, stopD: Date): string {
    const diffMs = stopD.getTime() - startD.getTime();
    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = diffHours / 24;

    if (diffDays > 7) return '6h';
    if (diffDays > 2) return '1h';
    if (diffHours > 12) return '15m';
    return '5m';
  }

  /**
   * Aplica un filtro de suavizado (deadband) a los datos combinados de telemetría.
   *
   * @param combined Datos combinados de InfluxDB
   * @param window Ventana de agregación utilizada
   * @returns Matriz de datos filtrada para el frontend
   */
  private applyHistoryDeadband(combined: any[], window: string): any[][] {
    const data: any[][] = [];
    let lastSavedPoint: any[] | null = null;

    for (let i = 0; i < combined.length; i++) {
      const r = combined[i];

      // Ignorar filas donde la agregación resultó nula o vacía
      if (r.voltaje_v === undefined && r.corriente_a === undefined) continue;

      const currentPoint = this.toHistoryPoint(r);
      const anomaly = r.anomaly_type || 'NONE';

      // Siempre incluir puntos de anomalías o extremos
      if (this.isEssentialPoint(anomaly, i, combined.length)) {
        data.push(currentPoint);
        lastSavedPoint = currentPoint;
        continue;
      }

      const inclusion = this.evaluateHistoryInclusion(
        currentPoint,
        lastSavedPoint,
        window,
        combined[i - 1],
      );

      if (inclusion.shouldInclude) {
        if (inclusion.prevPoint) data.push(inclusion.prevPoint);
        data.push(currentPoint);
        lastSavedPoint = currentPoint;
      }
    }

    return data;
  }

  /**
   * Determina si un punto es esencial (anomalía o extremo).
   *
   * @param anomaly Tipo de anomalía
   * @param index Índice actual
   * @param total Total de puntos
   */
  private isEssentialPoint(
    anomaly: string,
    index: number,
    total: number,
  ): boolean {
    return anomaly !== 'NONE' || index === 0 || index === total - 1;
  }

  /**
   * Convierte una fila de telemetría al formato de punto de historial.
   *
   * @param r Fila de telemetría
   * @returns Punto formateado
   */
  private toHistoryPoint(r: any): any[] {
    return [
      r._time,
      Number((r.voltaje_v ?? 0).toFixed(2)),
      Number((r.corriente_a ?? 0).toFixed(2)),
      Number((r.potencia_w ?? 0).toFixed(2)),
      Number((r.energia_kwh ?? 0).toFixed(2)),
      r.anomaly_type || 'NONE',
    ];
  }

  /**
   * Evalúa si un punto debe ser incluido basado en la ventana y fluctuaciones.
   *
   * @param current Punto actual
   * @param last Último punto guardado
   * @param window Ventana de agregación
   * @param prevRaw Punto anterior sin procesar
   */
  private evaluateHistoryInclusion(
    current: any[],
    last: any[] | null,
    window: string,
    prevRaw: any,
  ): { shouldInclude: boolean; prevPoint?: any[] } {
    if (!last) return { shouldInclude: true };

    if (window === '5m' || window === '15m') {
      const isFluctuation = this.checkHistoryFluctuation(current, last);

      if (isFluctuation) {
        const prevPoint =
          prevRaw && last[0] !== prevRaw._time
            ? this.toHistoryPoint(prevRaw)
            : undefined;
        return { shouldInclude: true, prevPoint };
      }
      return { shouldInclude: false };
    }

    return { shouldInclude: last[0] !== current[0] };
  }

  /**
   * Analiza variaciones significativas entre puntos.
   */
  private checkHistoryFluctuation(current: any[], last: any[]): boolean {
    const vDiff = Math.abs((current[1] as number) - (last[1] as number));
    const cDiff = Math.abs((current[2] as number) - (last[2] as number));
    const pDiff = Math.abs((current[3] as number) - (last[3] as number));
    const timeDiff =
      new Date(current[0] as string).getTime() -
      new Date(last[0] as string).getTime();

    const isFluctuation = vDiff > 0.5 || cDiff > 0.1 || pDiff > 5;
    const maxTimeExceeded = timeDiff > 1000 * 60 * 60; // 1 hora

    return isFluctuation || maxTimeExceeded;
  }
}
