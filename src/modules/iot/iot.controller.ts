import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  Body,
  UseGuards,
} from '@nestjs/common';
import { IotService } from './iot.service';
import {
  CreateIotDto,
  LinkIotUserDto,
  ResponseIotDto,
  GetHistoryDto,
  ResponseHistoryLightweightDto,
  ResponseIotListDto,
} from './dto/iot.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOperation,
  ApiTags,
  ApiBearerAuth,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('IoT')
@ApiBearerAuth()
@Controller('iot')
export class IotController {
  constructor(private readonly iotService: IotService) {}

  @Post('create')
  @Roles(2)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Registrar un nuevo dispositivo IoT (Admin)' })
  @ApiCreatedResponse({
    description: 'El dispositivo IoT ha sido registrado correctamente.',
  })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiForbiddenResponse({ description: 'Acceso prohibido.' })
  @ApiConflictResponse({
    description: 'El dispositivo con esta dirección MAC ya existe.',
  })
  async createIot(@Body() createIotDto: CreateIotDto): Promise<ResponseIotDto> {
    return this.iotService.createIot(createIotDto);
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Vincular un dispositivo IoT a un usuario (Aprovisionamiento directo por el dispositivo) (público)',
  })
  @ApiCreatedResponse({
    description:
      'El dispositivo IoT ha sido vinculado correctamente. Si estaba vinculado previamente, se limpiaron los datos de telemetría.',
  })
  @ApiBadRequestResponse({
    description:
      'Dispositivo no encontrado, inactivo o credenciales inválidas.',
  })
  @Public()
  async linkUserIot(
    @Body() linkIotUserDto: LinkIotUserDto,
  ): Promise<{ message: string }> {
    await this.iotService.linkIotUser(linkIotUserDto);
    return { message: 'Dispositivo vinculado correctamente' };
  }

  @Get('list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Obtener todos los dispositivos IoT de un usuario (privado)',
  })
  @ApiOkResponse({
    description: 'Lista de dispositivos IoT recuperada con éxito.',
    type: ResponseIotListDto,
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getIots(@GetUser() user: UserPayloadDto): Promise<ResponseIotListDto> {
    return this.iotService.getIotsByUser(user);
  }

  @Post('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Obtener datos históricos de telemetría para las gráficas (privado)',
  })
  @ApiOkResponse({
    description: 'Lecturas históricas en formato ligero (columnas + datos).',
    type: ResponseHistoryLightweightDto,
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async getHistory(
    @Body() getHistoryDto: GetHistoryDto,
    @GetUser() user: UserPayloadDto,
  ): Promise<ResponseHistoryLightweightDto> {
    return this.iotService.getDeviceHistory(getHistoryDto, user);
  }
}
