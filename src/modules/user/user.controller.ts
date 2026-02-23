import {
  Body,
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import {
  RegisterUserDto,
  ResponseGetProfileDto,
  ValidateEmailDto,
} from './dto/user.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

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
  @UseGuards(JwtAuthGuard)
  async getProfile(
    @GetUser() user: UserPayloadDto,
  ): Promise<ResponseGetProfileDto> {
    return this.userService.getProfile(user);
  }

  @Post('validateEmail')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Validar disponibilidad de correo (public)',
    description:
      'Verifica si un correo electrónico ya está registrado. Retorna 200 si está disponible, o lanza un error 409 (Conflict) si ya existe.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'El correo electrónico está disponible.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'El correo electrónico ya se encuentra registrado.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Datos de entrada inválidos (ej. correo mal formado).',
  })
  @Public()
  async validateEmail(
    @Body() validateEmailDto: ValidateEmailDto,
  ): Promise<{ message: string }> {
    await this.userService.validateEmail(validateEmailDto.email);
    return { message: 'Correo válido' };
  }
}
