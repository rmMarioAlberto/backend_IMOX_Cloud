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
  SoftResetIotDto,
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
    description: 'El IoT ha sido registrado correctamente.',
  })
  @ApiBadRequestResponse({ description: 'Datos de entrada inválidos.' })
  @ApiForbiddenResponse({ description: 'Prohibido.' })
  @ApiConflictResponse({
    description: 'El dispositivo con esta dirección MAC ya existe.',
  })
  async createIot(@Body() createIotDto: CreateIotDto): Promise<ResponseIotDto> {
    return this.iotService.createIot(createIotDto);
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link an IoT device to a user (private)' })
  @ApiCreatedResponse({
    description: 'The IoT device has been successfully linked.',
  })
  @ApiBadRequestResponse({ description: 'Device not found or invalid data.' })
  @ApiConflictResponse({ description: 'Device already linked to a user.' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async linkUserIot(
    @Body() linkIotUserDto: LinkIotUserDto,
    @GetUser() user: UserPayloadDto,
  ): Promise<{ message: string }> {
    await this.iotService.linkIotUser(linkIotUserDto, user);
    return { message: 'Device linked successfully' };
  }

  @Get('list')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get all IoT devices for the authenticated user (private)',
  })
  @ApiOkResponse({
    description: 'List of IoT devices successfully retrieved.',
    type: ResponseIotListDto,
  })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getIots(@GetUser() user: UserPayloadDto): Promise<ResponseIotListDto> {
    return this.iotService.getIotsByUser(user);
  }

  @Post('soft-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft reset an IoT device(private)' })
  @ApiCreatedResponse({
    description: 'The IoT device has been successfully soft reset.',
  })
  @ApiBadRequestResponse({ description: 'Device not found or invalid data.' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  async softResetIot(
    @Body() softResetIotDto: SoftResetIotDto,
    @GetUser() user: UserPayloadDto,
  ): Promise<{ message: string }> {
    await this.iotService.softResetIot(softResetIotDto, user);
    return { message: 'Device soft reset successfully' };
  }

  @Post('history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get historical telemetry data for charts (private)',
  })
  @ApiOkResponse({
    description: 'Historical readings in lightweight format (columns + data).',
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
