import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('IMOX Cloud API')
    .setDescription('Documentación de la API para el sistema IMOX Cloud IoT')
    .setVersion('1.0')
    .addTag('User', 'Operaciones de usuarios')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
