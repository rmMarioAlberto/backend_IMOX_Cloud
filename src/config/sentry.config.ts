import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

import { ConfigService } from '@nestjs/config';

export function initSentry(configService: ConfigService) {
  const dsn = configService.get<string>('GLITCHTIP_DSN');
  const environment = configService.get<string>('NODE_ENV') || 'development';

  if (dsn) {
    Sentry.init({
      dsn,
      environment,
      tracesSampleRate: 1,
      profilesSampleRate: 1,
      integrations: [nodeProfilingIntegration()],
    });
    console.log('GlitchTip inicializado correctamente');
  } else {
    console.warn('GLITCHTIP_DSN no configurado. Monitoreo deshabilitado.');
  }
}
