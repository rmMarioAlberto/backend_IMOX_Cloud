import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { globalValidationPipe } from './common/pipes/validation.pipe';

async function bootstrap() {
  // Inicializar Sentry
  if (process.env.GLITCHTIP_DSN) {
    Sentry.init({
      dsn: process.env.GLITCHTIP_DSN,
      environment: process.env.NODE_ENV || 'development',

      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,
      integrations: [nodeProfilingIntegration()],
    });
    console.log('GlitchTip inicializado correctamente');
  } else {
    console.warn('GLITCHTIP_DSN no configurado. Monitoreo deshabilitado.');
  }

  const app = await NestFactory.create(AppModule);

  // Aplicar validación global
  app.useGlobalPipes(globalValidationPipe);

  // Configurar Swagger
  const config = new DocumentBuilder()
    .setTitle('IMOX Cloud API')
    .setDescription('Documentación de la API para el sistema IMOX Cloud IoT')
    .setVersion('1.0')
    .addTag('User', 'Operaciones de usuarios')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  // Iniciar el servidor
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
