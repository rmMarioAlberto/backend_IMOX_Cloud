import { ThrottlerModuleOptions } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';

/**
 * @description Configuración de Rate Limiting para Fitness Gym API
 * @param configService ConfigService
 * @returns ThrottlerModuleOptions
 */
export const getThrottlerConfig = (
  configService: ConfigService,
): ThrottlerModuleOptions => {
  const ttl = configService.get<number>('THROTTLE_TTL', 60);
  const limit = configService.get<number>('THROTTLE_LIMIT', 10);

  return {
    throttlers: [
      {
        name: 'default',
        ttl: ttl * 1000,
        limit: limit,
      },
    ],
  };
};
