import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

/**
 * Servicio base de Redis
 * Maneja únicamente la conexión y ciclo de vida del cliente Redis
 * Los servicios especializados (AuthRedisService, TelemetryRedisService)
 * usan este servicio para acceder al cliente Redis
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: RedisClientType;
  private readonly logger = new Logger(RedisService.name);

  async onModuleInit() {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      throw new Error('REDIS_URL environment variable is not defined');
    }

    this.client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            this.logger.error('Redis: Máximo de reintentos alcanzado');
            return new Error('Redis connection failed');
          }
          const delay = Math.min(retries * 100, 3000);
          this.logger.warn(`Redis: Reintentando conexión en ${delay}ms...`);
          return delay;
        },
      },
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error', err);
    });

    this.client.on('connect', () => {
      this.logger.log('Redis conectado correctamente');
    });

    this.client.on('ready', () => {
      this.logger.log('Redis listo para recibir comandos');
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    await this.client.quit();
    this.logger.log('Redis desconectado');
  }

  /**
   * Obtener cliente Redis para operaciones especializadas
   * Este método es usado por servicios especializados como AuthRedisService y TelemetryRedisService
   */
  getClient(): RedisClientType {
    return this.client;
  }
}
