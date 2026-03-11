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
import { MailerSend, EmailParams, Sender, Recipient } from 'mailersend';
import { ConfigService } from '@nestjs/config';
import { JwtService } from './jwt.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly redisService: AuthRedisService,
    private readonly mariaDbService: MariaDbService,
    private readonly jwtService: JwtService,
    private readonly configService : ConfigService
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

  async sendVerificacionCode(email: string): Promise<void> {
    // 1. Validar que el usuario exista y esté activo
    const user = await this.mariaDbService.users.findUnique({
      where: { email, status: 1 },
    });

    if (!user) {
      throw new UnauthorizedException(
        'El correo no está registrado o la cuenta está inactiva',
      );
    }

    // 2. Verificar límite de intentos (3 por día)
    const attempts = await this.redisService.getResetAttempts(email);
    if (attempts >= 3) {
      throw new UnauthorizedException(
        'Has excedido el límite de 3 intentos de restablecimiento por día. Inténtalo de nuevo mañana.',
      );
    }

    const mailerSend = new MailerSend({
      apiKey: this.configService.get<string>('MAILERSEND_API_KEY') || '',
    });

    // Generar un código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Guardar en Redis con 5 min de TTL
    await this.redisService.saveVerificationCode(email, code);

    const sentFrom = new Sender(
      this.configService.get<string>('MAILERSEND_SENDER_EMAIL') ||
        'info@trial-7dnv5glpxqkgz85l.mlsender.net',
      this.configService.get<string>('MAILERSEND_SENDER_NAME') || 'Imox Cloud',
    );
    const recipients = [new Recipient(email, email)];

    const emailParams = new EmailParams()
      .setFrom(sentFrom)
      .setTo(recipients)
      .setSubject('Código de verificación - IMOX Cloud')
      .setHtml(
        `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
          <h2 style="color: #333; text-align: center;">Restablecer contraseña</h2>
          <p style="font-size: 16px; color: #555;">Tu código de verificación para restablecer tu contraseña en IMOX Cloud es:</p>
          <div style="font-size: 32px; font-weight: bold; color: #007bff; text-align: center; margin: 20px 0; letter-spacing: 5px;">
            ${code}
          </div>
          <p style="font-size: 14px; color: #888; text-align: center;">Este código expirará en 5 minutos.</p>
        </div>
      `,
      )
      .setText(
        `Tu código de verificación para restablecer tu contraseña en IMOX Cloud es: ${code}. Este código expirará en 5 minutos.`,
      );

    try {
      await mailerSend.email.send(emailParams);
      // Incrementamos el contador de intentos exitosos
      await this.redisService.incrementResetAttempt(email);
    } catch (error) {
      this.logger.error(
        `Error al enviar el email de verificación via MailerSend: ${error.message}`,
      );
      throw new Error('No se pudo enviar el código de verificación');
    }
  }

  /**
   * Verifica el código enviado por email
   * @param email
   * @param code
   */
  async verifyCode(email: string, code: string): Promise<void> {
    const savedCode = await this.redisService.getVerificationCode(email);

    if (!savedCode || savedCode !== code) {
      throw new UnauthorizedException(
        'Código de verificación inválido',
      );
    }

  }

  /**
   * Restablece la contraseña de un usuario usando el código de verificación enviado por email.
   * @param resetPasswordDto - DTO con email, code y nueva contraseña
   * @returns Promise<void>
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    const { email, code, newPassword } = resetPasswordDto;

    // 1. Validar el código nuevamente por seguridad
    const savedCode = await this.redisService.getVerificationCode(email);
    if (!savedCode || savedCode !== code) {
      throw new UnauthorizedException(
        'Código de verificación inválido o expirado',
      );
    }

    // 2. Buscar al usuario
    const user = await this.mariaDbService.users.findUnique({
      where: { email, status: 1 },
    });
    if (!user) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    // 3. Hashear y actualizar la contraseña
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);
    await this.mariaDbService.users.update({
      where: { id: user.id },
      data: { password: hashedNewPassword },
    });

    // 4. Invalidar el código en Redis (ya fue usado)
    await this.redisService.deleteVerificationCode(email);

    this.logger.log(`Contraseña restablecida exitosamente para: ${email}`);
  }
}
