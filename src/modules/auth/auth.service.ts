import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import {
  LoginUserDto,
  LoginResponseDto,
  RefreshTokenResponseDto,
  ResetPasswordDto,
} from './dto/auth.dto';
import { MariaDbService } from '../database/mariadb.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { JwtService } from './jwt.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly redisService: AuthRedisService,
    private readonly mariaDbService: MariaDbService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Autentica un usuario con email y contraseña. Retorna Access Token (15m) y Refresh Token (7d). Soporta sesiones múltiples si se envía deviceId.
   * @param loginUserDto - DTO con email y contraseña del usuario
   * @returns DTO con Access Token y Refresh Token
   */
  async login(loginUserDto: LoginUserDto): Promise<LoginResponseDto> {
    const { email, password } = loginUserDto;

    const user = await this.mariaDbService.users.findUnique({
      where: { email, status: 1 },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const deviceId = loginUserDto.deviceId || 'mobile_app_default';

    const sessionId = crypto.randomUUID();
    const payload = {
      sub: user.id,
      role: user.role,
      deviceId,
      sessionId,
    };

    const accessToken = await this.jwtService.generateAccessToken(payload);
    const refreshToken = await this.jwtService.generateRefreshToken(payload);

    await this.redisService.saveSession(user.id, deviceId, {
      refreshToken,
      sessionId,
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Cierra la sesión de un usuario, invalidando el Refresh Token.
   * @param refreshToken - Refresh Token a invalidar
   */
  async logout(refreshToken: string): Promise<void> {
    const isBlacklisted =
      await this.redisService.isTokenBlacklisted(refreshToken);
    if (isBlacklisted) {
      return;
    }

    try {
      const payload = await this.jwtService.verifyRefreshToken(refreshToken);
      const userId = payload.sub;
      const deviceId = payload.deviceId || 'mobile_app_default';

      // Calcular tiempo restante para blacklist
      const currentTimestamp = Math.floor(Date.now() / 1000);
      const expiresIn = payload.exp - currentTimestamp;

      if (expiresIn > 0) {
        await this.redisService.blacklistToken(refreshToken, expiresIn + 120);
      }

      await this.redisService.deleteSession(userId, deviceId);
    } catch (error) {
      this.logger.debug(
        `Logout con token inválido o expirado: ${error.message}`,
      );
    }
  }

  /**
   * Genera un nuevo par de tokens usando un Refresh Token válido.
   * @param refreshTokenDto - DTO con Refresh Token
   * @returns DTO con Access Token y Refresh Token
   */
  async refreshToken(refreshToken: string): Promise<RefreshTokenResponseDto> {
    const isBlacklisted =
      await this.redisService.isTokenBlacklisted(refreshToken);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token invalidado');
    }

    const payload = await this.jwtService.verifyRefreshToken(refreshToken);
    const userId = payload.sub;
    const deviceId = payload.deviceId || 'mobile_app_default';

    const session = await this.redisService.getSession(userId, deviceId);

    if (session?.refreshToken !== refreshToken) {
      if (session) {
        await this.redisService.deleteSession(userId, deviceId);
      }
      throw new UnauthorizedException('Token inválido o reusado');
    }

    const user = await this.mariaDbService.users.findUnique({
      where: { id: userId, status: 1 },
    });

    if (!user) {
      throw new UnauthorizedException('Usuario inactivo o no encontrado');
    }

    // Blacklist el token viejo antes de rotar
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const expiresIn = payload.exp - currentTimestamp;
    if (expiresIn > 0) {
      await this.redisService.blacklistToken(refreshToken, expiresIn + 120);
    }

    const newSessionId = crypto.randomUUID();
    const newPayload = {
      sub: user.id,
      role: user.role,
      deviceId,
      sessionId: newSessionId,
    };
    const newAccessToken =
      await this.jwtService.generateAccessToken(newPayload);
    const newRefreshToken =
      await this.jwtService.generateRefreshToken(newPayload);

    await this.redisService.saveSession(userId, deviceId, {
      refreshToken: newRefreshToken,
      sessionId: newSessionId,
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Restablece la contraseña de un usuario usando la MAC y el device secret de su IoT.
   *
   * Caso normal : el IoT ya está vinculado al usuario   → valida y resetea.
   * Caso A      : el IoT no tiene dueño                → vincula al usuario y resetea.
   * Rechazado   : credenciales inválidas o IoT de otro usuario.
   *
   * @param resetPasswordDto - DTO con userId, macAddress, iotToken y nueva contraseña
   * @returns Promise<void>
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const { newPassword, iotToken, userId, macAddress } = resetPasswordDto;

    // 1. Buscar el IoT por MAC (lookup rápido por índice único)
    const device = await this.mariaDbService.iot.findUnique({
      where: { mac_address: macAddress },
    });

    // Respuesta genérica: no revelar si la MAC existe o no
    if (!device?.device_secret) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // 2. Verificar posesión física con el device secret
    const isSecretValid = await bcrypt.compare(iotToken, device.device_secret);
    if (!isSecretValid) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // 3. Verificar propiedad del IoT
    //    - Sin dueño       → Caso A: se vincula al usuario
    //    - Mismo usuario   → caso normal
    //    - Otro usuario    → rechazado (no se puede usar el IoT ajeno)
    if (device.user_id == null) {
      await this.mariaDbService.iot.update({
        where: { mac_address: macAddress },
        data: { user_id: userId },
      });
    } else if (device.user_id !== userId) {
      throw new UnauthorizedException('Credenciales inválidas.');
    }

    // 4. Resetear la contraseña
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await this.mariaDbService.users.update({
      where: { id: userId },
      data: { password: hashedNewPassword },
    });
  }
}
