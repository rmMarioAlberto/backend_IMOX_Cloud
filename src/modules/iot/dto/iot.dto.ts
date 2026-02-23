import { Exclude, Expose } from 'class-transformer';
import { IsNotEmpty, IsString, IsMACAddress, IsNumber } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateIotDto {
  @ApiProperty({ example: '00:1A:7D:DA:71:13', description: 'Dirección MAC' })
  @IsString()
  @IsNotEmpty()
  @IsMACAddress()
  macAddress: string;
}

@Exclude()
export class ResponseIotDto {
  @ApiProperty({
    example: 1,
    description: 'ID único del dispositivo',
  })
  @Expose()
  id: number;

  @ApiProperty({
    example: 'd3a7f8e1c2b5a49687d0e9f2a1b3c4d5e6f7a8b9c0d1e2f3',
    description: 'Secreto del dispositivo (Device Secret)',
  })
  @Expose({ name: 'device_secret' })
  deviceSecret: string;

  @ApiProperty({ example: '00:1A:7D:DA:71:13', description: 'Dirección MAC' })
  @Expose({ name: 'mac_address' })
  macAddress: string;
}

export class LinkIotUserDto {
  @ApiProperty({ example: '00:1A:7D:DA:71:13', description: 'Dirección MAC' })
  @IsString()
  @IsNotEmpty()
  @IsMACAddress()
  macAddress: string;

  @ApiProperty({
    example: 'd3a7f8e1c2b5a49687d0e9f2a1b3c4d5e6f7a8b9c0d1e2f3',
    description: 'Secreto del dispositivo (Device Secret)',
  })
  @IsString()
  @IsNotEmpty()
  deviceSecret: string;

  @ApiProperty({
    example: 1,
    description: 'ID del usuario al que se vinculará',
  })
  @IsNumber()
  @IsNotEmpty()
  userId: number;
}

export class GetHistoryDto {
  @ApiProperty({
    example: '2024-01-01T00:00:00.000Z',
    description: 'Fecha de inicio para la consulta de historial (ISO 8601)',
  })
  @IsNotEmpty()
  @IsString()
  startDate: string;

  @ApiProperty({
    example: '2024-01-07T23:59:59.999Z',
    description: 'Fecha de fin para la consulta de historial (ISO 8601)',
  })
  @IsNotEmpty()
  @IsString()
  endDate: string;

  @ApiProperty({
    example: '1',
    description: 'ID del dispositivo IoT',
  })
  @IsNotEmpty()
  @IsNumber()
  iotId: number;
}

@Exclude()
export class ResponseHistoryLightweightDto {
  @ApiProperty({
    example: ['timestamp', 'voltaje', 'corriente', 'potencia', 'energia'],
    description: 'Definición de las columnas',
  })
  @Expose()
  columns: string[];

  @ApiProperty({
    example: [
      ['2025-12-30T10:00:00.000Z', 120, 10, 1200, 15],
      ['2025-12-30T10:05:00.000Z', 121, 11, 1220, 16],
    ],
    description: 'Puntos de datos como una matriz de matrices',
  })
  @Expose()
  data: any[][];
}

@Exclude()
export class IotDeviceDto {
  @ApiProperty({
    example: 1,
    description: 'ID del dispositivo IoT',
  })
  @Expose()
  id: number;

  @ApiProperty({
    example: '00:1A:7D:DA:71:13',
    description: 'Dirección MAC',
  })
  @Expose({ name: 'mac_address' })
  macAddress: string;

  @ApiProperty({
    example: 1,
    description: 'Estado (1 = activo, 0 = inactivo)',
  })
  @Expose()
  status: number;

  @ApiProperty({
    example: '2025-12-30T10:38:09.000Z',
    description: 'Fecha de creación',
  })
  @Expose({ name: 'created_at' })
  createdAt: Date;

  @ApiProperty({
    example: '2025-12-30T10:38:09.000Z',
    description: 'Fecha de actualización',
  })
  @Expose({ name: 'updated_at' })
  updatedAt: Date;
}

@Exclude()
export class ResponseIotListDto {
  @ApiProperty({
    type: [IotDeviceDto],
    description: 'Lista de dispositivos IoT',
  })
  @Expose()
  devices: IotDeviceDto[];
}
