import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  LoginUserDto,
  LoginResponseDto,
  ResetPasswordDto,
  LoginResponseControllerDto,
  RefreshTokenResponseControllerDto,
} from './dto/auth.dto';
import type { Request, Response } from 'express';
import { plainToInstance } from 'class-transformer';
import { Public } from 'src/common/decorators/public.decorator';

@ApiTags('Auth')
@Controller('auth')
@Public()
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión (public)',
    description:
      'Autentica un usuario con email y contraseña. Retorna Access Token (15m) y Refresh Token (7d). Soporta sesiones múltiples si se envía deviceId.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login exitoso',
    type: LoginResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Credenciales inválidas',
  })
  @ApiResponse({
    status: 429,
    description: 'Demasiados intentos de login (Rate Limit: 5 req/min)',
  })
  async login(
    @Body() loginUserDto: LoginUserDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseControllerDto> {
    const response = await this.authService.login(loginUserDto);
    res.cookie('refreshToken', response.refreshToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });
    return plainToInstance(LoginResponseControllerDto, response);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar sesión (public)',
    description:
      'Invalida el Refresh Token del usuario desde la cookie httpOnly.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sesión cerrada exitosamente',
  })
  @ApiBearerAuth()
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    const refreshToken = (req as any).cookies?.['refreshToken'];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie('refreshToken');
    return { message: 'Sesión cerrada exitosamente' };
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refrescar Access Token (public)',
    description:
      'Genera un nuevo par de tokens usando un Refresh Token válido desde cookies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens renovados exitosamente (Rotación)',
    type: RefreshTokenResponseControllerDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido, expirado o reusado',
  })
  @ApiBearerAuth()
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshTokenResponseControllerDto> {
    const refreshToken = (req as any).cookies?.['refreshToken'];
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token no encontrado');
    }

    const response = await this.authService.refreshToken(refreshToken);

    res.cookie('refreshToken', response.refreshToken, {
      httpOnly: true,
      secure: this.configService.get<string>('NODE_ENV') === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });

    return plainToInstance(RefreshTokenResponseControllerDto, response);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer contraseña (public)',
    description:
      'Cambia la contraseña usando la dirección MAC del dispositivo IoT vinculado al usuario.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contraseña actualizada exitosamente',
  })
  @ApiResponse({
    status: 401,
    description: 'Dispositivo IoT no encontrado o vincuado a otro usuario',
  })
  async resetPassword(
    @Body() dto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(dto);
    return { message: 'Contraseña actualizada exitosamente' };
  }
}
