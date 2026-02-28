import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  IsEmail,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';

/**
 * DTO para iniciar sesión de un usuario
 */
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

  @ApiProperty({
    example: 'android_uuid_12345',
    description: 'Identificador único del dispositivo',
    required: false,
  })
  @IsString()
  @IsOptional()
  deviceId?: string;
}

@Exclude()
/**
 * DTO para la respuesta de iniciar sesión de un usuario
 */
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

  @Expose()
  @ApiProperty({
    description: 'Datos del usuario autenticado',
    example: {
      id: 1,
      name: 'Juan Perez',
      email: 'juan@imox.cloud',
      role: 1,
    },
  })
  user: {
    id: number;
    name: string;
    email: string;
    role: number;
  };
}
/**
 * DTO para la respuesta de iniciar sesión de un usuario
 */
@Exclude()
export class LoginResponseControllerDto {
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
    description: 'Datos del usuario autenticado',
    example: {
      id: 1,
      name: 'Juan Perez',
      email: 'juan@imox.cloud',
      role: 1,
    },
  })
  user: {
    id: number;
    name: string;
    email: string;
    role: number;
  };
}

/**
 * DTO para cerrar sesión de un usuario
 */
export class LogoutUserDto {
  @ApiProperty({
    example: 'android_uuid_12345',
    description: 'ID del dispositivo a desconectar',
    required: false,
  })
  @IsString()
  @IsOptional()
  deviceId?: string;
}

/**
 * DTO para obtener un nuevo access token
 */
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
/**
 * DTO para la respuesta de obtener un nuevo access token
 */
export class RefreshTokenResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Nuevo token de acceso JWT',
  })
  @IsString()
  @IsNotEmpty()
  @Expose()
  accessToken: string;

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Nuevo token de refresco (rotación)',
  })
  @IsString()
  @IsNotEmpty()
  @Expose()
  refreshToken: string;
}

/**
 * DTO para restablecer la contraseña de un usuario
 */
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
  newPassword: string;

  @ApiProperty({
    example: 1,
    description: 'ID del usuario',
  })
  @IsNumber()
  @IsNotEmpty()
  userId: number;

  @ApiProperty({
    example: '123456',
    description: 'Device secret del dispositivo IoT',
  })
  @IsString()
  @IsNotEmpty()
  iotToken: string;

  @ApiProperty({
    example: 'AA:BB:CC:DD:EE:FF',
    description: 'Dirección MAC del dispositivo IoT',
  })
  @IsString()
  @IsNotEmpty()
  macAddress: string;
}

/**
 * DTO para el payload del usuario autenticado
 */
export class UserPayloadDto {
  id: number;
  email: string;
  role: number;
}

@Exclude()
/**
 * DTO para la respuesta de obtener un nuevo access token (Controller)
 */
export class RefreshTokenResponseControllerDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'Nuevo token de acceso JWT',
  })
  @IsString()
  @IsNotEmpty()
  @Expose()
  accessToken: string;
}
