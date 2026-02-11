import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis.service';

/**
 * Servicio especializado para operaciones de autenticación en Redis
 * Migrado desde RedisService para mejor organización y separación de responsabilidades
 */
@Injectable()
export class AuthRedisService {
  constructor(private readonly redisService: RedisService) {}

  // ==================== Session & Refresh Token Operations ====================

  /**
   * Guardar sesión completa (Refresh Token + Session ID)
   */
  async saveSession(
    userId: number,
    deviceId: string,
    data: { refreshToken: string; sessionId: string },
  ): Promise<void> {
    const client = this.redisService.getClient();
    const key = `imox:auth:session:${userId}:${deviceId}`;
    await client.set(key, JSON.stringify(data), {
      EX: 7 * 24 * 60 * 60, // 7 días
    });
  }

  /**
   * Obtener sesión completa
   */
  async getSession(
    userId: number,
    deviceId: string,
  ): Promise<{ refreshToken: string; sessionId: string } | null> {
    const client = this.redisService.getClient();
    const key = `imox:auth:session:${userId}:${deviceId}`;
    const result = await client.get(key);
    return result ? JSON.parse(result) : null;
  }

  /**
   * Eliminar sesión (logout)
   */
  async deleteSession(userId: number, deviceId: string): Promise<void> {
    const client = this.redisService.getClient();
    const key = `imox:auth:session:${userId}:${deviceId}`;
    await client.del(key);
  }

  // ==================== Password Reset Operations ====================

  /**
   * Guardar token de reset de contraseña
   */
  async savePasswordResetToken(token: string, userId: number): Promise<void> {
    const client = this.redisService.getClient();
    const key = `imox:auth:reset_token:${token}`;
    await client.set(key, userId.toString(), {
      EX: 15 * 60, // 15 minutos
    });
  }

  /**
   * Obtener userId del token de reset
   */
  async getPasswordResetUserId(token: string): Promise<number | null> {
    const client = this.redisService.getClient();
    const key = `imox:auth:reset_token:${token}`;
    const userId = await client.get(key);
    return userId ? Number.parseInt(userId, 10) : null;
  }

  /**
   * Eliminar token de reset de contraseña (ya usado)
   */
  async deletePasswordResetToken(token: string): Promise<void> {
    const client = this.redisService.getClient();
    const key = `imox:auth:reset_token:${token}`;
    await client.del(key);
  }

  // ==================== Rate Limiting ====================

  /**
   * Verifica Rate Limit (Límite de intentos)
   * Retorna true si debe ser bloqueado, false si está limpio.
   */
  async shouldBlockRequest(
    identifier: string,
    seconds: number,
  ): Promise<boolean> {
    const client = this.redisService.getClient();
    const key = `imox:ratelimit:${identifier}`;
    const exists = await client.get(key);
    if (exists) {
      return true;
    }
    await client.set(key, '1', { EX: seconds });
    return false;
  }

  // ==================== Token Blacklist ====================

  /**
   * Agregar Access Token a blacklist (logout antes de expiración)
   */
  async blacklistToken(token: string, expiresInSeconds: number): Promise<void> {
    const client = this.redisService.getClient();
    const key = `imox:auth:blacklist:${token}`;
    await client.set(key, '1', {
      EX: expiresInSeconds,
    });
  }

  /**
   * Verificar si un token está en blacklist
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const client = this.redisService.getClient();
    const key = `imox:auth:blacklist:${token}`;
    const result = await client.get(key);
    return result !== null;
  }
}
