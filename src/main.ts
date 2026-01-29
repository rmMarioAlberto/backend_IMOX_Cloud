import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { initSentry } from './config/sentry.config';
import { setupSwagger } from './config/swagger.config';
import { globalValidationPipe } from './common/pipes/validation.pipe';
import { corsConfig } from './config/cors.config';
import { AllExceptionsFilter } from './common/filters/exceptions.filter';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  app.use(
    helmet({
      contentSecurityPolicy: false, // APIs REST no envían HTML
      frameguard: { action: 'deny' }, // "X-Frame-Options: DENY"
      referrerPolicy: { policy: 'no-referrer' }, // Oculta la URL de origen en peticiones salientes
      hsts: isProduction
        ? {
            maxAge: 63072000, // Mantenemos 2 años
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );

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
