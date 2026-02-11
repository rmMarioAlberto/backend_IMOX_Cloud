import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerRequest } from '@nestjs/throttler';

/**
 * @description Clase que implementa el guard de rate limiting por roles
 */
@Injectable()
export class RoleThrottlerGuard extends ThrottlerGuard {
  /**
   * @description Implementación del guard de rate limiting por roles
   * @param requestProps ThrottlerRequest
   * @returns Promise<boolean>
   */
  protected async handleRequest(
    requestProps: ThrottlerRequest,
  ): Promise<boolean> {
    const {
      context,
      limit,
      ttl,
      throttler,
      getTracker,
      generateKey,
      blockDuration,
    } = requestProps;

    const { req } = this.getRequestResponse(context);

    // El usuario puede estar en req.user (HTTP) o en req.data.user (WebSockets en NestJS)
    const user = req.user || req.data?.user;

    // Límite por defecto (Guest / Auth) = 10
    let roleLimit = limit;

    if (user) {
      if (user.role === 2) {
        // Admin: 100 peticiones / min
        roleLimit = 100;
      } else if (user.role === 1) {
        // Member: 60 peticiones / min
        roleLimit = 60;
      }
    }

    return super.handleRequest({
      context,
      limit: roleLimit,
      ttl,
      throttler,
      getTracker,
      generateKey,
      blockDuration,
    });
  }
}
