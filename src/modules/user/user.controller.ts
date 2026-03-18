import {
  Body,
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UserService } from './user.service';
import { RegisterUserDto, ResponseGetProfileDto } from './dto/user.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import { ApiOperation, ApiResponse, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('User')
@ApiBearerAuth()
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar un nuevo usuario (public)',
    description: 'Crea un usuario en MariaDB si el email no existe.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: 'Usuario creado exitosamente.',
  })
  @ApiResponse({
    status: 409,
    description: 'El correo electrónico ya está registrado.',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos (validación fallida).',
  })
  @Public()
  async register(
    @Body() registerUserDto: RegisterUserDto,
  ): Promise<{ message: string }> {
    await this.userService.register(registerUserDto);
    return { message: 'Usuario registrado exitosamente' };
  }

  @Get('getProfile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener perfil de usuario (private)',
    description: 'Obtiene los datos del perfil de un usuario por su ID.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Perfil obtenido exitosamente.',
    type: ResponseGetProfileDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Usuario no encontrado.',
  })
  async getProfile(
    @GetUser() user: UserPayloadDto,
  ): Promise<ResponseGetProfileDto> {
    return this.userService.getProfile(user);
  }

  @Post('delete-account')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar cuenta de usuario (private)',
    description: 'Elimina permanentemente la cuenta del usuario y sus datos de telemetría asociados.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Cuenta eliminada exitosamente.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Usuario no encontrado.',
  })
  async deleteAccount(
    @GetUser() user: UserPayloadDto,
  ): Promise<{ message: string }> {
    await this.userService.deleteAccount(user.id);
    return { message: 'Cuenta eliminada exitosamente' };
  }
}
