import { Exclude, Expose } from 'class-transformer';
import { IsNotEmpty, IsString, IsMACAddress, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class createIotDto {
  @ApiProperty({ example: '00:1A:7D:DA:71:13', description: 'MAC Address' })
  @IsString()
  @IsNotEmpty()
  @IsMACAddress()
  macAddress: string;
}

@Exclude()
export class responseIotDto {
  @ApiProperty({
    example: 1,
    description: 'ID',
  })
  @Expose()
  id: number;

  @ApiProperty({
    example: 'd3a7f8e1c2b5a49687d0e9f2a1b3c4d5e6f7a8b9c0d1e2f3',
    description: 'Device Secret',
  })
  @Expose({ name: 'device_secret' })
  deviceSecret: string;

  @ApiProperty({ example: '00:1A:7D:DA:71:13', description: 'MAC Address' })
  @Expose({ name: 'mac_address' })
  macAddress: string;

  @ApiProperty({
    example: '2025-12-30T10:38:09.000Z',
    description: 'Created At',
  })
  @Expose({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({
    example: '2025-12-30T10:38:09.000Z',
    description: 'Updated At',
  })
  @Expose({ name: 'updated_at' })
  updatedAt: Date;
}

export class linkIotUserDto {
  @ApiProperty({ example: '00:1A:7D:DA:71:13', description: 'MAC Address' })
  @IsString()
  @IsNotEmpty()
  @IsMACAddress()
  macAddress: string;
}

export class softResetIotDto {
  @ApiProperty({ example: '00:1A:7D:DA:71:13', description: 'MAC Address' })
  @IsString()
  @IsNotEmpty()
  @IsMACAddress()
  macAddress: string;
}

export class GetHistoryDto {
  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Start date for history query (ISO 8601)',
  })
  @IsNotEmpty()
  @IsString()
  startDate: string;

  @ApiProperty({
    example: '2024-01-07T23:59:59.999Z',
    description: 'End date for history query (ISO 8601)',
  })
  @IsNotEmpty()
  @IsString()
  endDate: string;

  @ApiProperty({
    example: '1',
    description: 'ID iot',
  })
  @IsNotEmpty()
  @IsNumber()
  iotId: number;
}

@Exclude()
export class ResponseHistoryLightweightDto {
  @ApiProperty({
    example: ['timestamp', 'voltaje', 'corriente', 'potencia', 'energia'],
    description: 'Columns definition',
  })
  @Expose()
  columns: string[];

  @ApiProperty({
    example: [
      ['2025-12-30T10:00:00.000Z', 120, 10, 1200, 15],
      ['2025-12-30T10:05:00.000Z', 121, 11, 1220, 16],
    ],
    description: 'Data points as array of arrays',
  })
  @Expose()
  data: any[][];
}
