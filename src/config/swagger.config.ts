import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { writeFileSync } from 'node:fs';

/**
 * @description Configura la documentación de la API con Swagger
 * @param app INestApplication
 * @returns void
 */

export function setupSwagger(
  app: INestApplication,
  configService: ConfigService,
) {
  // Solo habilitar Swagger si no estamos en producción
  if (configService.get('NODE_ENV') === 'production') {
    return;
  }

  const config = new DocumentBuilder()
    .setTitle('IMOX Cloud API')
    .setDescription('Documentación de la API para el sistema IMOX Cloud IoT')
    .setVersion('1.0')
    .addBearerAuth() // <--- Habilitar autenticación Bearer
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // Generar archivo JSON para herramientas externas (como OWASP ZAP)
  try {
    writeFileSync('./openapi.json', JSON.stringify(document, null, 2));
  } catch (error) {
    console.error('Error al generar openapi.json:', error);
  }

  SwaggerModule.setup('api/docs', app, document);
}
