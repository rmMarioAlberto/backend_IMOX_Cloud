import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MariaDbService } from '../database/mariadb.service';
import { MqttService } from '../mqtt/mqtt.service';
import { CreateOtaDto } from './dto/create-ota.dto';
import { randomUUID } from 'node:crypto';

@Injectable()
export class OtaService {
  private readonly logger = new Logger(OtaService.name);

  constructor(
    private readonly prisma: MariaDbService,
    private readonly mqttService: MqttService,
  ) {}

  /**
   * @description Crea y despacha una actualización OTA hacia uno o todos los dispositivos.
   * Guarda el historial en la base de datos y publica el comando en el tópico MQTT
   * del dispositivo con retain:true para garantizar la entrega incluso si el
   * dispositivo está offline en el momento de la petición.
   */
  async createOtaUpdate(dto: CreateOtaDto) {
    this.logger.log(
      `Iniciando OTA versión ${dto.version}. Target: ${JSON.stringify(dto.target)}`,
    );

    // Resolver la lista de dispositivos objetivo
    let devicesToUpdate: { id: number; mac_address: string }[];

    if (dto.target === 'ALL') {
      devicesToUpdate = await this.prisma.iot.findMany({
        where: { status: 1 },
        select: { id: true, mac_address: true },
      });
    } else {
      if (!Array.isArray(dto.target) || dto.target.length === 0) {
        throw new BadRequestException(
          'Target debe ser "ALL" o un array de IDs de dispositivos.',
        );
      }
      devicesToUpdate = await this.prisma.iot.findMany({
        where: { id: { in: dto.target }, status: 1 },
        select: { id: true, mac_address: true },
      });
    }

    if (devicesToUpdate.length === 0) {
      this.logger.warn(
        'No se encontraron dispositivos activos para la actualización OTA.',
      );
      return {
        message: 'No se encontraron dispositivos activos para actualizar.',
        total: 0,
        dispatched: [],
      };
    }

    const dispatched: { deviceId: number; mac: string; jobId: string }[] = [];

    for (const device of devicesToUpdate) {
      const jobId = `ota_${randomUUID()}`;

      // 1. Guardar el registro en la base de datos como PENDING
      await this.prisma.ota_updates.create({
        data: {
          job_id: jobId,
          version: dto.version,
          url: dto.url,
          hash: dto.hash ?? null,
          status: 'PENDING',
          device_id: device.id,
        },
      });

      // 2. Publicar el comando OTA vía MQTT con retain:true
      const mqttPayload: Record<string, unknown> = {
        job_id: jobId,
        version: dto.version,
        url: dto.url,
      };
      if (dto.hash) {
        mqttPayload.hash = dto.hash;
      }

      this.mqttService.publishOtaCommand(device.id, mqttPayload);

      dispatched.push({ deviceId: device.id, mac: device.mac_address, jobId });
    }

    this.logger.log(
      `OTA encolada exitosamente para ${dispatched.length} dispositivo(s).`,
    );

    return {
      message: `Comando OTA v${dto.version} enviado a ${dispatched.length} dispositivo(s).`,
      total: dispatched.length,
      dispatched,
    };
  }

  /**
   * @description Devuelve el historial de actualizaciones OTA con filtros opcionales.
   * Si se especifica deviceId, filtra para ese dispositivo únicamente.
   */
  async getOtaHistory(deviceId?: number) {
    const where = deviceId ? { device_id: deviceId } : {};
    return this.prisma.ota_updates.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        job_id: true,
        version: true,
        url: true,
        hash: true,
        status: true,
        step: true,
        device_id: true,
        created_at: true,
        updated_at: true,
      },
    });
  }
}
