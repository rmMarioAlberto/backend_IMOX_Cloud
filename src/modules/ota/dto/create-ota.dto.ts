import {
  IsString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOtaDto {
  @ApiProperty({ description: 'Versión objetivo del firmware (ej: v2.1.0)' })
  @IsString()
  @IsNotEmpty()
  version: string;

  @ApiProperty({
    description: 'URL de descarga del binario del firmware (HTTPS)',
  })
  @IsString()
  @IsNotEmpty()
  url: string;

  @ApiPropertyOptional({
    description: 'Hash MD5/SHA256 del binario para verificación de integridad',
  })
  @IsString()
  @IsOptional()
  hash?: string;

  /**
   * Puede ser "ALL" para actualizar todos los dispositivos activos,
   * o un array de IDs numéricos para actualizar selectivamente.
   * Ejemplos: "ALL" | [1, 2, 3]
   */
  @ApiProperty({
    description:
      'Dispositivos objetivo. Use "ALL" para todos los dispositivos activos, o un array de IDs: [1, 2, 3]',
    examples: {
      all: { value: 'ALL' },
      specific: { value: [1, 2, 3] },
    },
  })
  @IsNotEmpty()
  target: 'ALL' | number[];
}
