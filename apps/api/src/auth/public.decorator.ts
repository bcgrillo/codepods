import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marks a route (or controller) as exempt from the global admin auth guard. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
