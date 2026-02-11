import {
  Body,
  Controller,
  Post,
  Get,
  UseInterceptors,
  ClassSerializerInterceptor,
  HttpCode,
  HttpStatus,
  UseGuards,
  Patch,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  RegisterUserDto,
  RegisterResponseDto,
  ResponseGetProfileDto,
  EditProfileDto,
} from './dto/user.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('User')
@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Registrar un nuevo usuario (public)',
    description: 'Crea un usuario en PostgreSQL si el email no existe.',
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
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getProfile(
    @GetUser() user: UserPayloadDto,
  ): Promise<ResponseGetProfileDto> {
    return this.userService.getProfile(user);
  }

  @Patch('editProfile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Editar perfil de usuario (private)',
    description: 'Actualiza el nombre del usuario autenticado.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Perfil actualizado exitosamente.',
  })
  async editProfile(
    @Body() dto: EditProfileDto,
    @GetUser() user: UserPayloadDto,
  ): Promise<{ message: string }> {
    await this.userService.editProfile(dto, user.id);
    return { message: 'Perfil actualizado exitosamente' };
  }
}
