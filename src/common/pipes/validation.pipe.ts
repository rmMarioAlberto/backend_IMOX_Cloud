import { ValidationPipe } from '@nestjs/common';

const isProduction = process.env.NODE_ENV === 'production';

export const globalValidationPipe = new ValidationPipe({
  whitelist: true, // Eliminar propiedades no permitidas
  forbidNonWhitelisted: true, // Prohibir propiedades no permitidas
  transform: true, // Transformar datos
  transformOptions: {
    enableImplicitConversion: false, // Convertir datos implícitos
  },

  //Ocultar detalles de errores de validación
  disableErrorMessages: isProduction,

  // Detener al primer error
  stopAtFirstError: isProduction,
});
