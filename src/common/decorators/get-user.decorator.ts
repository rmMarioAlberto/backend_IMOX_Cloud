import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * @description Decorador que se encarga de obtener el usuario de la petición
 * @param data - Datos adicionales
 * @param ctx - Contexto de la petición
 * @returns Usuario de la petición
 */
export const GetUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
