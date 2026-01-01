import {
  IsEmail,
  isNotEmpty,
  IsNotEmpty,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  MinLength,
  IsArray,
} from 'class-validator';
import { Exclude, Expose } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

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

@Exclude()
export class RegisterResponseDto {
  @ApiProperty({ example: 1, description: 'ID único del usuario creado' })
  @Expose()
  id: number;
}

@Exclude()
export class responseGetProfileDto {
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

export class editProfileDto {
  @ApiProperty({ example: 'carlos', description: 'username' })
  @IsNotEmpty()
  @IsString()
  name: string;
}
