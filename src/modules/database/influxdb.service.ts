import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InfluxDB, WriteApi } from '@influxdata/influxdb-client';

@Injectable()
export class InfluxDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(InfluxDbService.name);
  private influxDB: InfluxDB;
  private writeApi: WriteApi;

  private readonly url: string;
  private readonly token: string;
  private readonly org: string;
  private readonly bucket: string;

  constructor(private readonly configService: ConfigService) {
    this.url = this.configService.get<string>('INFLUXDB_URL') || '';
    this.token = this.configService.get<string>('INFLUXDB_TOKEN') || '';
    this.org = this.configService.get<string>('INFLUXDB_ORG') || '';
    this.bucket = this.configService.get<string>('INFLUXDB_BUCKET') || '';

    if (!this.url || !this.token || !this.org || !this.bucket) {
      throw new Error(
        'InfluxDB environment variables are missing. Required: INFLUXDB_URL, INFLUXDB_TOKEN, INFLUXDB_ORG, INFLUXDB_BUCKET',
      );
    }
  }

  async onModuleInit() {
    this.influxDB = new InfluxDB({ url: this.url, token: this.token });
    this.writeApi = this.influxDB.getWriteApi(this.org, this.bucket);

    this.writeApi.useDefaultTags({ source: 'imox_backend' });

    this.logger.log('Conectado a InfluxDB correctamente');
  }

  async onModuleDestroy() {
    try {
      await this.writeApi.close();
      this.logger.log('Desconectado de InfluxDB');
    } catch (error) {
      this.logger.error('Error al cerrar InfluxDB WriteApi', error);
    }
  }

  /**
   * Obtener WriteApi para operaciones de escritura
   * Usado por servicios especializados como TelemetryInfluxService
   */
  getWriteApi(): WriteApi {
    return this.writeApi;
  }

  /**
   * Obtener QueryApi para operaciones de lectura
   * Usado por servicios especializados como TelemetryInfluxService
   */
  getQueryApi() {
    return this.influxDB.getQueryApi(this.org);
  }

  /**
   * Obtener nombre de la organización
   */
  getOrg(): string {
    return this.org;
  }

  /**
   * Obtener nombre del bucket
   */
  getBucket(): string {
    return this.bucket;
  }
}
