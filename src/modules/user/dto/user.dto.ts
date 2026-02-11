import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO para registrar un nuevo usuario
 */
export class RegisterUserDto {
  @ApiProperty({
    example: 'Juan Pérez',
    description: 'Nombre completo del usuario',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name: string;

  @ApiProperty({
    example: 'usuario@imox.cloud',
    description: 'Correo electrónico único',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(50)
  email: string;

  @ApiProperty({
    example: 'password123',
    description: 'Contraseña segura (mínimo 8 caracteres)',
    minLength: 8,
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(50)
  password: string;
}
/**
 * DTO para la respuesta del registro de un nuevo usuario
 */
@Exclude()
export class RegisterResponseDto {
  @ApiProperty({ example: 1, description: 'ID único del usuario creado' })
  @Expose()
  id: number;
}

/**
 * DTO para la respuesta de obtener el perfil del usuario
 */
@Exclude()
export class ResponseGetProfileDto {
  @ApiProperty({ example: 1, description: 'ID único del usuario' })
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  id: number;

  @ApiProperty({
    example: 'user1@gmail.com',
    description: 'Correo electrónico del usuario',
  })
  @Expose()
  @IsNotEmpty()
  @IsString()
  email: string;

  @ApiProperty({ example: 'user', description: 'Nombre del usuario' })
  @Expose()
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiProperty({ example: 1, description: 'ID del rol asignado' })
  @Expose()
  @IsNotEmpty()
  @IsNumber()
  role: number;
}
/**
 * DTO para la solicitud de editar el perfil del usuario
 */
export class EditProfileDto {
  @ApiProperty({ example: 'carlos', description: 'username' })
  @IsNotEmpty()
  @IsString()
  name: string;
}
