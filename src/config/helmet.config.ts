import { HelmetOptions } from 'helmet';
import { ConfigService } from '@nestjs/config';

/**
 * @description Configura las cabeceras de seguridad con Helmet
 * @param configService ConfigService
 * @returns HelmetOptions
 */
export const getHelmetConfig = (
  configService: ConfigService,
): HelmetOptions => ({
  // Deshabilitamos CSP
  contentSecurityPolicy: false,

  // Ocultar cabecera "X-Powered-By"
  hidePoweredBy: true,

  // HTTP Strict Transport Security (HSTS)
  hsts:
    configService.get('NODE_ENV') === 'production'
      ? {
          maxAge: 31536000, // 1 año
          includeSubDomains: true,
          preload: true,
        }
      : false,

  // Evita que el navegador "adivine" el tipo MIME
  noSniff: true,

  // protección contra Clickjacking
  frameguard: { action: 'deny' },

  // Previene descargas automáticas en versiones antiguas de IE
  ieNoOpen: true,

  // Deshabilitamos el filtro XSS del navegador
  xssFilter: false,
});
