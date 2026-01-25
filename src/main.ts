import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initSentry } from './config/sentry.config';
import { setupSwagger } from './config/swagger.config';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { corsConfig } from './config/cors.config';
import { AllExceptionsFilter } from './common/filters/exceptions.filter';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Inicializar Sentry
  initSentry(configService);

  // Configurar CORS para Web, Móvil y IoT
  app.enableCors(corsConfig(configService));

  // Aplicar filtro global de excepciones
  app.useGlobalFilters(new AllExceptionsFilter(configService));

  // Aplicar validación global
  app.useGlobalPipes(globalValidationPipe(configService));

  // Configurar Swagger
  setupSwagger(app);

  // Iniciar el servidor
  const port = configService.get<number>('NESTJS_PORT') || 3000;
  await app.listen(port);
}
bootstrap();
