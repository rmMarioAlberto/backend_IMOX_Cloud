import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthRedisService } from '../database/auth/auth-redis.service';
import {
  LoginUserDto,
  LoginResponseDto,
  RefreshTokenResponseDto,
  RequestResetPasswordDto,
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from './dto/auth.dto';
import { MariaDbService } from '../database/mariadb.service';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { JwtService } from './jwt.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly redisService: AuthRedisService,
    private readonly mariaDbService: MariaDbService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
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
   * Restablece la contraseña de un usuario usando el token/código recibido.
   * @param resetPasswordDto - DTO con token y nueva contraseña
   * @returns DTO con mensaje de éxito
   */
  async resetPassword(
    resetPasswordDto: ResetPasswordDto,
  ): Promise<ResetPasswordResponseDto> {
    const { token, password } = resetPasswordDto;

    // 1. Validar token en Redis
    const userId = await this.redisService.getPasswordResetUserId(token);

    if (!userId) {
      throw new UnauthorizedException('Código inválido o expirado');
    }

    // 2. Hash nueva contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    // 3. Actualizar usuario
    await this.mariaDbService.users.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // 4. Eliminar token de Redis (para que no se use 2 veces)
    await this.redisService.deletePasswordResetToken(token);

    return { message: 'Contraseña actualizada exitosamente' };
  }

  /**
   * Solicita el restablecimiento de la contraseña de un usuario.
   * @param requestResetPasswordDto - DTO con email del usuario
   * @returns DTO con mensaje de éxito
   */
  async requestPasswordReset(requestResetPasswordDto: RequestResetPasswordDto) {
    const { email } = requestResetPasswordDto;

    // 1. Rate Limiting: 1 petición cada 120 segudos por email
    const isBlocked = await this.redisService.shouldBlockRequest(email, 120);
    if (isBlocked) {
      throw new HttpException(
        'Demasiados intentos. Intenta de nuevo en 2 minutos.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const user = await this.mariaDbService.users.findUnique({
      where: { email },
    });

    if (!user) {
      // Por seguridad, no decimos si el correo existe o no
      return {
        message: 'Si el correo existe, recibirás un código. (Revisa SPAM)',
      };
    }

    // Generar código de 6 dígitos
    const token = Math.floor(100000 + Math.random() * 900000).toString();

    // Guardar en Redis (15 minutos de vida)
    await this.redisService.savePasswordResetToken(token, user.id);

    // Enviar correo real con Brevo
    await this.mailService.sendResetEmail(email, token);

    return {
      message: 'Código enviado exitosamente. Revisa tu correo.',
      debug_token:
        this.configService.get('NODE_ENV') === 'development'
          ? token
          : undefined,
    };
  }
}
