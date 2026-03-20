import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initSentry } from './config/sentry.config';
import { setupSwagger } from './config/swagger.config';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { corsConfig } from './config/cors.config';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { existsSync, mkdirSync } from 'node:fs';
import cookieParser from 'cookie-parser';
import { getHelmetConfig } from './config/helmet.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Asegurar que la carpeta de almacenamiento existe al arrancar
  const uploadPath = join(__dirname, '..', 'uploads/ota');
  if (!existsSync(uploadPath)) {
    mkdirSync(uploadPath, { recursive: true });
  }

  app.useStaticAssets(uploadPath, {
    prefix: '/ota/downloads/',
  });
  app.use(cookieParser());
  const configService = app.get(ConfigService);

  app.use(helmet(getHelmetConfig(configService)));

  // Inicializar Sentry
  initSentry(configService);

  // Configurar CORS para Web, Móvil y IoT
  app.enableCors(corsConfig(configService));

  // Aplicar validación global
  app.useGlobalPipes(globalValidationPipe(configService));

  // Configurar Swagger
  setupSwagger(app, configService);

  // Iniciar el servidor
  const port = configService.get<number>('NESTJS_PORT') || 3000;
  await app.listen(port);
}
bootstrap();
