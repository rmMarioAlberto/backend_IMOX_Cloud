import {
  Body,
  Controller,
  Post,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpCode,
} from '@nestjs/common';
import { UserService } from './user.service';
import { RegisterUserDto, RegisterResponseDto } from './dto/user.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  @HttpCode(201)
  @ApiOperation({
    summary: 'Registrar un nuevo usuario',
    description: 'Crea un usuario en PostgreSQL si el email no existe.',
  })
  @ApiResponse({
    status: 201,
    description: 'Usuario creado exitosamente.',
    type: RegisterResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'El correo electrónico ya está registrado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos (validación fallida).',
  })
  @UseInterceptors(ClassSerializerInterceptor)
  async register(
    @Body() registerUserDto: RegisterUserDto,
  ): Promise<RegisterResponseDto> {
    return this.userService.register(registerUserDto);
  }
}
