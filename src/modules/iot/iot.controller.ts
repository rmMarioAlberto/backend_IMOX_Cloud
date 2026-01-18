import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  Body,
  UseGuards,
} from '@nestjs/common';
import { IotService } from './iot.service';
import {
  createIotDto,
  linkIotUserDto,
  responseIotDto,
  softResetIotDto,
  GetHistoryDto,
  ResponseHistoryLightweightDto,
} from './dto/iot.dto';
import { UserPayloadDto } from '../auth/dto/auth.dto';
import { responseMessage } from '../../common/utils/dto/utils.dto';
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
  @ApiOperation({ summary: 'Link an IoT device to a user (private)' })
  @ApiCreatedResponse({
    description: 'The IoT device has been successfully linked.',
    type: responseMessage,
  })
  @ApiBadRequestResponse({ description: 'Device not found or invalid data.' })
  @ApiConflictResponse({ description: 'Device already linked to a user.' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  linkUserIot(
    @Body() linkIotUserDto: linkIotUserDto,
    @GetUser() user: UserPayloadDto,
  ): Promise<responseMessage> {
    return this.iotService.linkIotUser(linkIotUserDto, user);
  }

  @Post('soft-reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Soft reset an IoT device(private)' })
  @ApiCreatedResponse({
    description: 'The IoT device has been successfully soft reset.',
    type: responseMessage,
  })
  @ApiBadRequestResponse({ description: 'Device not found or invalid data.' })
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  softResetIot(
    @Body() softResetIotDto: softResetIotDto,
    @GetUser() user: UserPayloadDto,
  ): Promise<responseMessage> {
    return this.iotService.softResetIot(softResetIotDto, user);
  }

  // @Post('history')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({
  //   summary: 'Get historical telemetry data for charts (private)',
  // })
  // @ApiOkResponse({
  //   description: 'Historical readings in lightweight format (columns + data).',
  //   type: ResponseHistoryLightweightDto,
  // })
  // @UseGuards(JwtAuthGuard)
  // @ApiBearerAuth()
  // async getHistory(
  //   @Body() getHistoryDto: GetHistoryDto,
  //   @GetUser() user: UserPayloadDto,
  // ): Promise<ResponseHistoryLightweightDto> {
  //   return this.iotService.getDeviceHistory(getHistoryDto, user);
  // }
}
