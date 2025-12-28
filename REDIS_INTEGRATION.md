# Integración de Redis en Nest.js

## 📦 Instalación de Dependencias

```bash
npm install @nestjs/cache-manager cache-manager cache-manager-redis-store redis
npm install -D @types/cache-manager-redis-store
```

## ⚙️ Configuración en AppModule

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    
    // Configuración de Redis/Cache
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        host: configService.get('REDIS_HOST'),
        port: configService.get('REDIS_PORT'),
        password: configService.get('REDIS_PASSWORD'),
        ttl: 60 * 60, // 1 hora por defecto
      }),
    }),
  ],
})
export class AppModule {}
```

## 🔐 Uso para Sesiones JWT

### 1. Módulo de Autenticación

```typescript
// src/modules/auth/auth.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private jwtService: JwtService,
  ) {}

  // Guardar refresh token en Redis
  async saveRefreshToken(userId: string, refreshToken: string) {
    const key = `refresh_token:${userId}`;
    // TTL de 7 días (604800 segundos)
    await this.cacheManager.set(key, refreshToken, 604800);
  }

  // Validar refresh token
  async validateRefreshToken(userId: string, token: string): Promise<boolean> {
    const key = `refresh_token:${userId}`;
    const storedToken = await this.cacheManager.get<string>(key);
    return storedToken === token;
  }

  // Invalidar token (logout)
  async invalidateRefreshToken(userId: string) {
    const key = `refresh_token:${userId}`;
    await this.cacheManager.del(key);
  }

  // Blacklist de Access Tokens (logout antes de expiración)
  async blacklistAccessToken(token: string, expiresIn: number) {
    const key = `blacklist:${token}`;
    await this.cacheManager.set(key, '1', expiresIn);
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const key = `blacklist:${token}`;
    const result = await this.cacheManager.get(key);
    return !!result;
  }
}
```

### 2. Guard para Verificar Blacklist

```typescript
// src/common/guards/jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '@modules/auth/auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const canActivate = await super.canActivate(context);
    if (!canActivate) return false;

    const request = context.switchToHttp().getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    // Verificar si el token está en blacklist
    if (token && await this.authService.isTokenBlacklisted(token)) {
      return false;
    }

    return true;
  }
}
```

## 🚀 Otros Usos de Redis

### Rate Limiting

```typescript
// src/common/guards/throttle.guard.ts
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class RateLimitService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async checkRateLimit(ip: string, limit: number = 100): Promise<boolean> {
    const key = `rate_limit:${ip}`;
    const current = await this.cacheManager.get<number>(key) || 0;
    
    if (current >= limit) {
      return false; // Límite excedido
    }

    await this.cacheManager.set(key, current + 1, 60); // 1 minuto TTL
    return true;
  }
}
```

### Caché de Consultas MongoDB

```typescript
// src/modules/telemetry/telemetry.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';

@Injectable()
export class TelemetryService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async getLatestReading(deviceMac: string) {
    const cacheKey = `latest_reading:${deviceMac}`;
    
    // Intentar obtener de caché
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) return cached;

    // Si no existe, consultar BD
    const reading = await this.telemetryModel.findOne({ deviceMac })
      .sort({ timestamp: -1 })
      .exec();

    // Guardar en caché por 5 minutos
    await this.cacheManager.set(cacheKey, reading, 300);
    
    return reading;
  }
}
```

## 🔍 Comandos Útiles

```bash
# Conectar a Redis CLI
docker exec -it imox_redis redis-cli -a redis_password_change_in_production

# Ver todas las keys
KEYS *

# Ver una key específica
GET refresh_token:user123

# Ver TTL de una key
TTL refresh_token:user123

# Eliminar una key
DEL refresh_token:user123

# Ver estadísticas
INFO stats

# Monitorear comandos en tiempo real
MONITOR
```

## 📊 Estructura de Keys Recomendada

```
refresh_token:{userId}           → Refresh tokens (TTL: 7d)
blacklist:{accessToken}          → Access tokens invalidados (TTL: tiempo restante)
rate_limit:{ip}                  → Rate limiting (TTL: 1m)
latest_reading:{deviceMac}       → Última lectura del sensor (TTL: 5m)
device_status:{deviceMac}        → Estado de conexión IoT (TTL: 10m)
session:{sessionId}              → Datos de sesión completos (TTL: 24h)
```

## ⚠️ Notas de Producción

1. **Persistencia AOF**: Ya está habilitada con `--appendonly yes`
2. **Password**: Cambiar `REDIS_PASSWORD` en producción
3. **Memoria**: Redis está limitado solo por RAM disponible
4. **Backup**: AOF se escribe en `/data` (volumen persistente)
5. **Clustering**: Para escalabilidad, considerar Redis Cluster

## 🎯 Próximos Pasos

1. Instalar dependencias: `npm install @nestjs/cache-manager cache-manager cache-manager-redis-store redis`
2. Configurar `CacheModule` en `app.module.ts`
3. Implementar `AuthService` con métodos de Redis
4. Crear guard para validar tokens blacklisted
