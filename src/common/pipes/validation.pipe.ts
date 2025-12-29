import { ValidationPipe } from '@nestjs/common';

const isProduction = process.env.NODE_ENV === 'production';

export const globalValidationPipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: true,
  },

  // En producción: Ocultar detalles de errores de validación
  disableErrorMessages: isProduction,

  // Detener al primer error (mejor performance en producción)
  stopAtFirstError: isProduction,
});
