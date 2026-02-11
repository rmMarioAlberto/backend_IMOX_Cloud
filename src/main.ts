import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initSentry } from './config/sentry.config';
import { setupSwagger } from './config/swagger.config';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { corsConfig } from './config/cors.config';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { getHelmetConfig } from './config/helmet.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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
