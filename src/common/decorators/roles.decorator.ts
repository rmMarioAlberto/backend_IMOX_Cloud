import { SetMetadata } from '@nestjs/common';

/**
 * @description Decorador que se encarga de establecer los roles permitidos para una ruta
 * @param roles - Roles permitidos
 * @returns SetMetadata
 */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: number[]) => SetMetadata(ROLES_KEY, roles);
