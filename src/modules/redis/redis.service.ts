import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

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

  // ==================== Telemetry Operations ====================

  /**
   * Guardar última lectura para telemetría (usado por MQTT)
   */
  async setTelemetryLast(
    iotId: number,
    data: any,
    ttl: number = 600,
  ): Promise<void> {
    const key = `iot:${iotId}:last`;
    await this.client.set(key, JSON.stringify(data), { EX: ttl });
  }

  /**
   * Obtener última lectura de telemetría
   */
  async getTelemetryLast(iotId: number): Promise<any | null> {
    const key = `iot:${iotId}:last`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Agregar evento crítico al buffer
   */
  async pushCriticalEvent(iotId: number, data: any): Promise<void> {
    const key = `iot:${iotId}:critical_buffer`;
    await this.client.lPush(key, JSON.stringify(data));
    // Limitar a últimos 100 eventos
    await this.client.lTrim(key, 0, 99);
    // Agregar TTL de 1 hora
    await this.client.expire(key, 3600);
  }

  /**
   * Obtener todos los eventos críticos del buffer
   */
  async getCriticalEvents(iotId: number): Promise<any[]> {
    const key = `iot:${iotId}:critical_buffer`;
    const events = await this.client.lRange(key, 0, -1);
    return events.map((e) => JSON.parse(e));
  }

  /**
   * Limpiar buffer de eventos críticos
   */
  async clearCriticalEvents(iotId: number): Promise<void> {
    const key = `iot:${iotId}:critical_buffer`;
    await this.client.del(key);
  }

  /**
   * Guardar baseline para detección de picos
   */
  async setBaseline(
    iotId: number,
    data: any,
    ttl: number = 3600,
  ): Promise<void> {
    const key = `iot:${iotId}:baseline`;
    await this.client.set(key, JSON.stringify(data), { EX: ttl });
  }

  /**
   * Obtener baseline
   */
  async getBaseline(iotId: number): Promise<any | null> {
    const key = `iot:${iotId}:baseline`;
    const data = await this.client.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Obtener todas las keys que coincidan con un patrón
   */
  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  // ==================== Operaciones de Autenticación ====================

  /**
   * Guardar Refresh Token
   */
  async saveRefreshToken(
    userId: number,
    deviceId: string,
    token: string,
  ): Promise<void> {
    const key = `imox:auth:refresh:${userId}:${deviceId}`;
    await this.client.set(key, token, {
      EX: 7 * 24 * 60 * 60, // 7 días
    });
  }

  /**
   * Obtener Refresh Token
   */
  async getRefreshToken(
    userId: number,
    deviceId: string,
  ): Promise<string | null> {
    const key = `imox:auth:refresh:${userId}:${deviceId}`;
    return await this.client.get(key);
  }

  /**
   * Eliminar Refresh Token (logout)
   */
  async deleteRefreshToken(userId: number, deviceId: string): Promise<void> {
    const key = `imox:auth:refresh:${userId}:${deviceId}`;
    await this.client.del(key);
  }

  /**
   * Guardar token de reset de contraseña
   */
  async savePasswordResetToken(token: string, userId: number): Promise<void> {
    const key = `imox:auth:reset_token:${token}`;
    await this.client.set(key, userId.toString(), {
      EX: 15 * 60, // 15 minutos
    });
  }

  /**
   * Obtener userId del token de reset
   */
  async getPasswordResetUserId(token: string): Promise<number | null> {
    const key = `imox:auth:reset_token:${token}`;
    const userId = await this.client.get(key);
    return userId ? parseInt(userId, 10) : null;
  }

  /**
   * Eliminar token de reset de contraseña (ya usado)
   */
  async deletePasswordResetToken(token: string): Promise<void> {
    const key = `imox:auth:reset_token:${token}`;
    await this.client.del(key);
  }

  /**
   * Verifica Rate Limit (Límite de intentos)
   * Retorna true si debe ser bloqueado, false si está limpio.
   */
  async shouldBlockRequest(
    identifier: string,
    seconds: number,
  ): Promise<boolean> {
    const key = `imox:ratelimit:${identifier}`;
    const exists = await this.client.get(key);
    if (exists) {
      return true;
    }
    await this.client.set(key, '1', { EX: seconds });
    return false;
  }

  // ==================== Blacklist de Tokens ====================

  /**
   * Agregar Access Token a blacklist (logout antes de expiración)
   */
  async blacklistToken(token: string, expiresInSeconds: number): Promise<void> {
    const key = `imox:auth:blacklist:${token}`;
    await this.client.set(key, '1', {
      EX: expiresInSeconds,
    });
  }

  /**
   * Verificar si un token está en blacklist
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const key = `imox:auth:blacklist:${token}`;
    const result = await this.client.get(key);
    return result !== null;
  }
}
