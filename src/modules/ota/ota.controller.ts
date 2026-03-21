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
import { Public } from '../../common/decorators/public.decorator';

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

  /**
   * GET /ota/available-files
   * Lista archivos .bin en el servidor. Solo Admin.
   */
  @Get('available-files')
  @Roles(2)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Listar archivos de firmware disponibles (Solo Admin)' })
  @ApiOkResponse({ description: 'Lista de archivos .bin.' })
  async getAvailableFiles() {
    return this.otaService.getAvailableFiles();
  }

  /**
   * GET /ota/latest
   * Consulta la actualización más reciente disponible para un dispositivo.
   * Usado por los dispositivos IoT para auto-descubrimiento.
   */
  @Get('latest')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar la última actualización disponible' })
  @ApiQuery({ name: 'deviceId', required: false, type: Number })
  async getLatestUpdate(
    @Query('deviceId', new ParseIntPipe({ optional: true }))
    deviceId?: number,
  ) {
    return this.otaService.getLatestUpdate(deviceId);
  }
}
