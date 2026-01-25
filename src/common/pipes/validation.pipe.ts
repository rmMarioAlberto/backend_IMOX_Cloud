import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const globalValidationPipe = (configService: ConfigService) => {
  const isProduction = configService.get('NODE_ENV') === 'production';

  return new ValidationPipe({
    whitelist: true, // Eliminar propiedades no permitidas
    forbidNonWhitelisted: true, // Prohibir propiedades no permitidas
    transform: true, // Transformar datos
    transformOptions: {
      enableImplicitConversion: false, // Convertir datos implícitos
    },

    // Detener al primer error
    stopAtFirstError: isProduction,
  });
};
