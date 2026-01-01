import {
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import {
  LoginUserDto,
  LoginResponseDto,
  LogoutResponseDto,
  RefreshTokenDto,
  RefreshTokenResponseDto,
  RequestResetPasswordDto,
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from './dto/auth.dto';
import { PrismaMysqlService } from '../prisma/prisma-mysql.service';
import * as bcrypt from 'bcrypt';
import { JwtService } from './jwt.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly redisService: RedisService,
    private readonly prismaService: PrismaMysqlService,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
  ) {}

  async login(loginUserDto: LoginUserDto): Promise<LoginResponseDto> {
    const { email, password } = loginUserDto;

    const user = await this.prismaService.users.findUnique({
      where: { email },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (user.status !== 1) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const deviceId = loginUserDto.deviceId || 'mobile_app_default';

    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      deviceId, // Importante para validar luego
    };

    const accessToken = await this.jwtService.generateAccessToken(payload);
    const refreshToken = await this.jwtService.generateRefreshToken(payload);

    await this.redisService.saveRefreshToken(user.id, deviceId, refreshToken);

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

  async logout(
    userId: number,
    deviceId: string | undefined,
    accessToken?: string,
  ): Promise<LogoutResponseDto> {
    const targetDevice = deviceId || 'mobile_app_default';
    await this.redisService.deleteRefreshToken(userId, targetDevice);

    if (accessToken) {
      const token = accessToken.replace('Bearer ', '');
      const decoded = this.jwtService.decode(token);
      if (decoded && decoded.exp) {
        const ttl = decoded.exp - Math.floor(Date.now() / 1000);
        if (ttl > 0) {
          await this.redisService.blacklistToken(token, ttl + 120);
        }
      }
    }

    return { message: 'Sesión cerrada exitosamente' };
  }

  async refreshToken(
    refreshTokenDto: RefreshTokenDto,
  ): Promise<RefreshTokenResponseDto> {
    const { refreshToken } = refreshTokenDto;

    try {
      const payload = await this.jwtService.verifyToken(refreshToken);
      const userId = payload.sub;
      const deviceId = payload.deviceId || 'mobile_app_default';

      const storedToken = await this.redisService.getRefreshToken(
        userId,
        deviceId,
      );
      if (!storedToken || storedToken !== refreshToken) {
        if (storedToken) {
          await this.redisService.deleteRefreshToken(userId, deviceId);
        }
        throw new UnauthorizedException('Token inválido o reusado');
      }

      const user = await this.prismaService.users.findUnique({
        where: { id: userId, status: 1 },
      });

      if (!user) {
        throw new UnauthorizedException('Usuario inactivo o no encontrado');
      }

      const newPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        deviceId,
      };
      const newAccessToken =
        await this.jwtService.generateAccessToken(newPayload);
      const newRefreshToken =
        await this.jwtService.generateRefreshToken(newPayload);

      await this.redisService.saveRefreshToken(
        userId,
        deviceId,
        newRefreshToken,
      );

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      throw new UnauthorizedException('Refresh token inválido o expirado');
    }
  }

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
    await this.prismaService.users.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // 4. Eliminar token de Redis (para que no se use 2 veces)
    await this.redisService.deletePasswordResetToken(token);

    return { message: 'Contraseña actualizada exitosamente' };
  }

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

    const user = await this.prismaService.users.findUnique({
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
      debug_token: process.env.NODE_ENV === 'development' ? token : undefined,
    };
  }
}
