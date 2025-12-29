import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  IsNumber,
  IsEmail,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

export class LoginUserDto {
  @ApiProperty({
    example: 'usuario@imox.cloud',
    description: 'Correo electrónico del usuario',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(50)
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'Contraseña del usuario',
    minLength: 8,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(50)
  password: string;
}

@Exclude()
export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token de acceso JWT (válido por 15 minutos)',
  })
  @IsString()
  @IsNotEmpty()
  @Expose()
  accessToken: string;

  @Expose()
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token de refresco (válido por 7 días)',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;

  @ApiProperty({
    example: 1,
    description: 'Rol del usuario (1: Usuario, 2: Admin)',
    enum: [1, 2],
  })
  @IsNumber()
  @IsNotEmpty()
  role: number;
}

export class LogoutUserDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token de refresco a invalidar',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

@Exclude()
export class LogoutResponseDto {
  @ApiProperty({
    example: 'Sesión cerrada exitosamente',
    description: 'Mensaje de confirmación',
  })
  @IsString()
  @IsNotEmpty()
  @Expose()
  message: string;
}

export class RefreshTokenDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Token de refresco para obtener un nuevo access token',
  })
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

@Exclude()
export class RefreshTokenResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Nuevo token de acceso JWT',
  })
  @IsString()
  @IsNotEmpty()
  @Expose()
  accessToken: string;
}

export class ResetPasswordDto {
  @ApiProperty({
    example: 'newPassword123',
    description: 'Nueva contraseña del usuario',
    minLength: 8,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(50)
  password: string;

  @ApiProperty({
    example: 1,
    description: 'ID del usuario que cambia la contraseña',
  })
  @IsNumber()
  @IsNotEmpty()
  id: number;
}

@Exclude()
export class ResetPasswordResponseDto {
  @ApiProperty({
    example: 'Contraseña actualizada exitosamente',
    description: 'Mensaje de confirmación',
  })
  @IsString()
  @IsNotEmpty()
  @Expose()
  message: string;
}
