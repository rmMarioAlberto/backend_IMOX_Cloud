import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { MariaDbService } from '../database/mariadb.service';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly prisma: MariaDbService,
    private readonly redisService: AuthRedisService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_ACCESS_SECRET') || 'secretKey',
      passReqToCallback: true,
    });
  }

  /**
   * Valida el token y retorna el payload
   * @param req - Request HTTP
   * @param payload - Payload del token
   * @returns Payload del token
   */
  async validate(req: Request, payload: any) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    if (token) {
      const isBlacklisted = await this.redisService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        throw new UnauthorizedException('Token invalidado');
      }

      // Validar sessionId
      const deviceId = payload.deviceId || 'mobile_app_default';
      const sessionId = payload.sessionId;

      if (!sessionId) {
        throw new UnauthorizedException('Token sin sesión');
      }

      const session = await this.redisService.getSession(payload.sub, deviceId);

      if (!session || session.sessionId !== sessionId) {
        throw new UnauthorizedException('Sesión invalidada');
      }
    }
    const user = await this.prisma.users.findUnique({
      where: { id: payload.sub, status: 1 },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    return { id: user.id, email: user.email, role: user.role };
  }
}
