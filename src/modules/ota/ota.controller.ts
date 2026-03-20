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
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
   * POST /ota/upload
   * Sube un archivo binario de firmware a la Raspberry Pi.
   * Solo Admin.
   */
  @Post('upload')
  @Roles(2)
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Subir un archivo binario de firmware (Solo Admin)' })
  async uploadFirmware(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new HttpException('No se recibió ningún archivo', HttpStatus.BAD_REQUEST);
    }
    return this.otaService.uploadFirmware(file);
  }

  /**
   * POST /ota
   * Solo pueden llamar a este endpoint usuarios con rol Administrador (role = 2).
   */
  @Post()
  @Roles(2)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Enviar actualización OTA de firmware a dispositivos (Solo Admin)',
  })
  @ApiCreatedResponse({ description: 'Comando OTA publicado exitosamente.' })
  @ApiForbiddenResponse({ description: 'Acceso prohibido.' })
  @ApiBadRequestResponse({ description: 'Datos inválidos.' })
  async createOtaUpdate(@Body() createOtaDto: CreateOtaDto) {
    if (!createOtaDto.target) {
      throw new HttpException('Target (device array or "ALL") is required', HttpStatus.BAD_REQUEST);
    }
    return this.otaService.createOtaUpdate(createOtaDto);
  }

  /**
   * GET /ota/history
   */
  @Get('history')
  @Roles(2)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar historial de actualizaciones OTA (Solo Admin)' })
  @ApiQuery({ name: 'deviceId', required: false, type: Number })
  @ApiOkResponse({ description: 'Historial de actualizaciones OTA.' })
  @ApiForbiddenResponse({ description: 'Acceso prohibido.' })
  async getHistory(
    @Query('deviceId', new ParseIntPipe({ optional: true }))
    @Optional()
    deviceId?: number,
  ) {
    return this.otaService.getOtaHistory(deviceId);
  }
}
