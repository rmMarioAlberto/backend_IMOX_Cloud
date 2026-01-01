import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Body,
  UseGuards,
  BadRequestException,
  Param,
} from '@nestjs/common';
import { IotService } from './iot.service';
import {
  createIotDto,
  linkIotUserDto,
  responseIotDto,
  responseLinkIotUserDto,
  responseSoftResetIotDto,
  softResetIotDto,
  GetHistoryDto,
  ResponseHistoryLightweightDto,
} from './dto/iot.dto';
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
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { GetUser } from '../../common/decorators/get-user.decorator';

@ApiTags('IoT')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('iot')
export class IotController {
  constructor(private readonly iotService: IotService) {}

  @Post('create')
  @Roles(2)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new IoT device (Admin)' })
  @ApiCreatedResponse({
    description: 'The IoT device has been successfully registered.',
    type: responseIotDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input data.' })
  @ApiForbiddenResponse({ description: 'Forbidden.' })
  @ApiConflictResponse({
    description: 'Device with this MAC address already exists.',
  })
  createIot(@Body() createIotDto: createIotDto): Promise<responseIotDto> {
    return this.iotService.createIot(createIotDto);
  }

  @Post('link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link an IoT device to a user' })
  @ApiCreatedResponse({
    description: 'The IoT device has been successfully linked.',
    type: responseLinkIotUserDto,
  })
  @ApiBadRequestResponse({ description: 'Device not found or invalid data.' })
  @ApiConflictResponse({ description: 'Device already linked to a user.' })
  linkUserIot(
    @Body() linkIotUserDto: linkIotUserDto,
  ): Promise<responseLinkIotUserDto> {
    return this.iotService.linkIotUser(linkIotUserDto);
  }

  @Post('soft-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft reset an IoT device' })
  @ApiCreatedResponse({
    description: 'The IoT device has been successfully soft reset.',
    type: responseSoftResetIotDto,
  })
  @ApiBadRequestResponse({ description: 'Device not found or invalid data.' })
  softResetIot(
    @Body() softResetIotDto: softResetIotDto,
  ): Promise<responseSoftResetIotDto> {
    return this.iotService.softResetIot(softResetIotDto);
  }

  @Post(':id/history')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get historical telemetry data for charts' })
  @ApiOkResponse({
    description: 'Historical readings in lightweight format (columns + data).',
    type: ResponseHistoryLightweightDto,
  })
  async getHistory(
    @Param('id') id: string,
    @Body() getHistoryDto: GetHistoryDto,
    @GetUser() user: any,
  ): Promise<ResponseHistoryLightweightDto> {
    return this.iotService.getDeviceHistory(
      Number(id),
      user.sub,
      getHistoryDto.startDate,
      getHistoryDto.endDate,
    );
  }
}
