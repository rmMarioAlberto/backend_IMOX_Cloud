import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { MariaDbService } from '../database/mariadb.service';
import { MqttService } from '../mqtt/mqtt.service';
import { CreateOtaDto } from './dto/create-ota.dto';
import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import { writeFileSync, existsSync, mkdirSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class OtaService {
  private readonly logger = new Logger(OtaService.name);

  constructor(
    private readonly prisma: MariaDbService,
    private readonly mqttService: MqttService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * @description Sube un archivo binario de firmware al servidor local.
   * Calcula el hash SHA256 y genera la URL de descarga vía Tailscale Funnel.
   */
  async uploadFirmware(file: Express.Multer.File) {
    const uploadDir = join(process.cwd(), 'uploads', 'ota');
    if (!existsSync(uploadDir)) {
      mkdirSync(uploadDir, { recursive: true });
    }

    // Generar un nombre único para evitar colisiones
    const fileName = `${Date.now()}-${file.originalname}`;
    const filePath = join(uploadDir, fileName);

    // Guardar el archivo
    writeFileSync(filePath, file.buffer);

    // Calcular el hash SHA256
    const hash = createHash('sha256').update(file.buffer).digest('hex');

    // Generar la URL (Usando el dominio proporcionado por el usuario en .env)
    const baseUrl = this.configService.get<string>('OTA_BASE_URL') || 'http://localhost:3000';
    const downloadUrl = `${baseUrl}/ota/downloads/${fileName}`;

    this.logger.log(`Nuevo firmware subido: ${fileName}. Hash: ${hash}`);

    return {
      message: 'Archivo subido exitosamente',
      fileName,
      url: downloadUrl,
      hash,
    };
  }

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
    
    // Validar que el firmware existe y el hash es correcto si es una URL local
    this.validateFirmwareFile(dto.url, dto.hash);

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

  /**
   * @description Lista todos los archivos binarios disponibles en la carpeta de subidas.
   */
  async getAvailableFiles() {
    const uploadDir = join(process.cwd(), 'uploads', 'ota');
    if (!existsSync(uploadDir)) {
      return [];
    }

    const files = readdirSync(uploadDir);
    return files
      .filter((f) => f.endsWith('.bin'))
      .map((fileName) => {
        const stats = statSync(join(uploadDir, fileName));
        const baseUrl = this.configService.get<string>('OTA_BASE_URL') || 'http://localhost:3000';
        return {
          fileName,
          size: stats.size,
          createdAt: stats.birthtime,
          url: `${baseUrl}/ota/downloads/${fileName}`,
        };
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * @description Devuelve la actualización más reciente disponible para un dispositivo.
   */
  async getLatestUpdate(deviceId?: number) {
    const where = deviceId ? { device_id: deviceId } : {};
    return this.prisma.ota_updates.findFirst({
      where,
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        job_id: true,
        version: true,
        url: true,
        hash: true,
        status: true,
        device_id: true,
        created_at: true,
      },
    });
  }

  /**
   * @description Verifica si un archivo de firmware existe localmente y si su hash coincide.
   * @throws BadRequestException si el archivo no existe o el hash es incorrecto.
   */
  private validateFirmwareFile(url: string, providedHash?: string) {
    const configBaseUrl = this.configService.get<string>('OTA_BASE_URL') || 'http://localhost:3000';
    const baseUrl = `${configBaseUrl}/ota/downloads/`;
    if (!url.startsWith(baseUrl)) {
      this.logger.warn(`URL externa detectada para OTA: ${url}. Saltando validación local.`);
      return;
    }

    const fileName = url.replace(baseUrl, '');
    const uploadDir = join(process.cwd(), 'uploads', 'ota');
    const filePath = join(uploadDir, fileName);

    if (!existsSync(filePath)) {
      throw new BadRequestException(`El archivo de firmware especificado no existe en el servidor: ${fileName}`);
    }

    if (providedHash) {
      const fileBuffer = readFileSync(filePath);
      const actualHash = createHash('sha256').update(fileBuffer).digest('hex');
      if (actualHash !== providedHash) {
        throw new BadRequestException(
          `El hash proporcionado no coincide con el archivo en el servidor. Proporcionado: ${providedHash.substring(0, 8)}..., Actual: ${actualHash.substring(0, 8)}...`,
        );
      }
    }
  }
}
