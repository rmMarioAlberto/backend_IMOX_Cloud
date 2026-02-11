import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

/**
 * @description Inicializa el monitoreo de errores con GlitchTip
 * @param configService ConfigService
 * @returns void
 */

export function initSentry(configService: ConfigService) {
  const dsn = configService.get<string>('GLITCHTIP_DSN');
  const environment = configService.get<string>('NODE_ENV') || 'development';
  const logger = new Logger('Sentry');
  if (dsn) {
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: 1,
      profilesSampleRate: 1,
    });
    logger.log('GlitchTip inicializado correctamente');
  } else {
    logger.warn('GLITCHTIP_DSN no configurado. Monitoreo deshabilitado.');
  }
}
