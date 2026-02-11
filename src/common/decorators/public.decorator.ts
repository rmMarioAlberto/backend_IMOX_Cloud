import { SetMetadata } from '@nestjs/common';

/**
 * @description Set metadata to indicate that a route is public
 * @returns Metadata to be passed to the decorator
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
