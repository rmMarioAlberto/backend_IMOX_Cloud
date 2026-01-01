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
  responseGetProfileDto,
  editProfileDto,
} from './dto/user.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import { responseMessage } from '../../common/utils/dto/utils.dto';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GetUser } from 'src/common/decorators/get-user.decorator';

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

  @Get('getProfile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener perfil de usuario (private)',
    description: 'Obtiene los datos del perfil de un usuario por su ID.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Perfil obtenido exitosamente.',
    type: responseGetProfileDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Usuario no encontrado.',
  })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async getProfile(
    @GetUser() user: UserPayloadDto,
  ): Promise<responseGetProfileDto> {
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
    type: responseMessage,
  })
  async editProfile(
    @Body() dto: editProfileDto,
    @GetUser() user: UserPayloadDto,
  ): Promise<responseMessage> {
    return this.userService.editProfile(dto, user.id);
  }
}
