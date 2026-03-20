import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Optional,
  HttpException,
} from '@nestjs/common';
import { OtaService } from './ota.service';
import { CreateOtaDto } from './dto/create-ota.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiBadRequestResponse,
  ApiOkResponse,
  ApiQuery,
} from '@nestjs/swagger';

@ApiTags('OTA')
@ApiBearerAuth()
@Controller('ota')
export class OtaController {
  constructor(private readonly otaService: OtaService) {}

  /**
   * POST /ota
   * Solo pueden llamar a este endpoint usuarios con rol Administrador (role = 2).
   * Acepta target = "ALL" o target = [1, 2, 3]
   */
  @Post()
  @Roles(2)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Enviar actualización OTA de firmware a uno o todos los dispositivos activos (Solo Admin)',
  })
  @ApiCreatedResponse({
    description:
      'Comando OTA publicado exitosamente en el broker MQTT con retain:true.',
  })
  @ApiForbiddenResponse({ description: 'Acceso prohibido. Se requiere rol Admin.' })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos o sin dispositivos activos.' })
  async createOtaUpdate(@Body() createOtaDto: CreateOtaDto) {
    if (!createOtaDto.target) {
      throw new HttpException(
        'Target (device array or "ALL") is required',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.otaService.createOtaUpdate(createOtaDto);
  }

  /**
   * GET /ota/history?deviceId=1
   * Devuelve el historial de actualizaciones OTA.
   * Si se pasa deviceId filtra por ese dispositivo.
   * Solo Admin puede consultar el historial.
   */
  @Get('history')
  @Roles(2)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Consultar historial de actualizaciones OTA (Solo Admin)',
  })
  @ApiQuery({
    name: 'deviceId',
    required: false,
    type: Number,
    description: 'ID del dispositivo a filtrar (opcional)',
  })
  @ApiOkResponse({ description: 'Historial de actualizaciones OTA.' })
  @ApiForbiddenResponse({ description: 'Acceso prohibido. Se requiere rol Admin.' })
  async getHistory(
    @Query('deviceId', new ParseIntPipe({ optional: true }))
    @Optional()
    deviceId?: number,
  ) {
    return this.otaService.getOtaHistory(deviceId);
  }
}
