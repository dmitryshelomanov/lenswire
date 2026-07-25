import type { HttpMethod } from '@/entities/traffic/types';
import type { VariantProps } from 'class-variance-authority';

import { badgeVariants } from '@/shared/ui/badge';

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>['variant']>;

export function methodBadgeVariant(method: HttpMethod): BadgeVariant {
  switch (method) {
    case 'GET':
      return 'info';
    case 'POST':
      return 'success';
    case 'PUT':
    case 'PATCH':
      return 'warning';
    case 'DELETE':
      return 'danger';
    default:
      return 'default';
  }
}

export function statusBadgeVariant(status: number): BadgeVariant {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'info';
  return 'success';
}
