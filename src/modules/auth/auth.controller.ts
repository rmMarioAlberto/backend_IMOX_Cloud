import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import {
  LoginUserDto,
  LoginResponseDto,
  LogoutUserDto,
  LogoutResponseDto,
  RefreshTokenDto,
  RefreshTokenResponseDto,
  RequestResetPasswordDto,
  ResetPasswordDto,
  ResetPasswordResponseDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Iniciar sesión',
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
  login(@Body() loginUserDto: LoginUserDto) {
    return this.authService.login(loginUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cerrar sesión',
    description: 'Invalida el Refresh Token del usuario.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Sesión cerrada exitosamente',
    type: LogoutResponseDto,
  })
  @ApiBearerAuth()
  logout(@Req() req: any, @Body() logoutUserDto: LogoutUserDto) {
    const accessToken = req.headers.authorization;
    return this.authService.logout(
      req.user.id,
      logoutUserDto.deviceId,
      accessToken,
    );
  }

  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refrescar Access Token',
    description:
      'Genera un nuevo par de tokens usando un Refresh Token válido.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens renovados exitosamente (Rotación)',
    type: RefreshTokenResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Refresh token inválido, expirado o reusado',
  })
  refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('request-reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Solicitar recuperación de contraseña',
    description:
      'Envía un código de recuperación al correo electrónico si existe.',
  })
  @ApiResponse({
    status: 200,
    description: 'Correo enviado (simulado en consola dev)',
  })
  requestResetPassword(@Body() dto: RequestResetPasswordDto) {
    return this.authService.requestPasswordReset(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restablecer contraseña',
    description: 'Cambia la contraseña usando el token/código recibido.',
  })
  @ApiResponse({
    status: 200,
    description: 'Contraseña actualizada exitosamente',
    type: ResetPasswordResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Código inválido o expirado',
  })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }
}
