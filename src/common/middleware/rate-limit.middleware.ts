import {
  Injectable,
  NestMiddleware,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitRecord {
  count: number;
  lastRequest: number;
  resetTime: number;
}

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

/**
 * NOTA: MQTT tiene su propio rate limiting en el broker (Mosquitto/EMQX)
 */
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimitMiddleware.name);
  private readonly requests: Map<string, RateLimitRecord> = new Map();

  // Configuraciones por tipo de endpoint
  private readonly configs: Map<string, RateLimitConfig> = new Map([
    ['auth', { windowMs: 60000, maxRequests: 20 }], // Login: 5 req/min
    ['iot', { windowMs: 60000, maxRequests: 1000 }], // IoT data: 1000 req/min
    ['default', { windowMs: 60000, maxRequests: 100 }], // General: 100 req/min
  ]);

  constructor() {
    // Limpiar registros antiguos cada 5 minutos
    setInterval(() => this.cleanupOldRecords(), 5 * 60 * 1000);
    this.logger.log('Rate limiter inicializado para REST API');
  }

  use = (req: Request, res: Response, next: NextFunction) => {
    // EXCLUIR WebSockets del rate limiting
    const upgrade = req.headers.upgrade;
    if (upgrade && upgrade.toLowerCase() === 'websocket') {
      return next();
    }

    // Identificar cliente (user_id > device_id > IP)
    const identifier = this.getIdentifier(req);

    // Determinar configuración según la ruta
    const config = this.getConfigForPath(req.path);
    const now = Date.now();
    const key = `${identifier}:${req.path}`;

    // Obtener o crear registro
    let record = this.requests.get(key);

    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        lastRequest: now,
        resetTime: now + config.windowMs,
      };
      this.requests.set(key, record);
    }

    // Incrementar contador
    record.count++;
    record.lastRequest = now;

    // Verificar límite
    if (record.count > config.maxRequests) {
      const retryAfter = Math.ceil((record.resetTime - now) / 1000);

      res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('X-RateLimit-Reset', record.resetTime.toString());
      res.setHeader('Retry-After', retryAfter.toString());

      this.logger.warn(
        `Rate limit excedido: ${identifier} en ${req.path}. Retry: ${retryAfter}s`,
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Demasiadas peticiones. Intenta en ${retryAfter} segundos.`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Headers informativos
    const remaining = Math.max(0, config.maxRequests - record.count);
    res.setHeader('X-RateLimit-Limit', config.maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', remaining.toString());
    res.setHeader('X-RateLimit-Reset', record.resetTime.toString());

    next();
  };

  /**
   * Identificador único priorizando device/user sobre IP
   */
  private getIdentifier(req: Request): string {
    // 1. Header personalizado para dispositivos IoT
    const deviceId = req.headers['x-device-id'] as string;
    if (deviceId) return `device:${deviceId}`;

    // 2. Usuario autenticado
    const userId = (req as any).user?.id;
    if (userId) return `user:${userId}`;

    // 3. Fallback a IP
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ip = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return `ip:${ip.trim()}`;
    }

    return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
  }

  /**
   * Selecciona configuración según la ruta del endpoint
   */
  private getConfigForPath(path: string): RateLimitConfig {
    if (path.includes('/auth') || path.includes('/login')) {
      return this.configs.get('auth')!;
    }
    if (path.includes('/iot') || path.includes('/device')) {
      return this.configs.get('iot')!;
    }
    return this.configs.get('default')!;
  }

  private cleanupOldRecords() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime + 60000) {
        // 1 min de margen
        this.requests.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Limpiados ${cleaned} registros de rate limit`);
    }
  }

  public reset(identifier: string): void {
    this.requests.delete(identifier);
  }

  public getStats() {
    return {
      totalTracked: this.requests.size,
      configs: Object.fromEntries(this.configs),
    };
  }
}
