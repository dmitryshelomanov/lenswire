import type { VariantProps } from 'class-variance-authority';

import type { HttpMethod } from '@/entities/traffic/types';
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
    case 'CONNECT':
      return 'default';
    default:
      return 'default';
  }
}

export function reasonLabel(reasonCode: string | undefined): string | null {
  if (!reasonCode) return null;
  switch (reasonCode) {
    case 'decrypted':
      return 'decrypted';
    case 'http_plain':
      return 'http';
    case 'decrypt_disabled':
      return 'tls off';
    case 'ca_missing':
      return 'no ca';
    case 'ip_no_sni':
      return 'no sni';
    case 'mitm_bypassed':
      return 'bypassed';
    case 'mitm_fail_open':
      return 'fail-open';
    case 'mitm_handshake_failed':
      return 'trust?';
    case 'passthrough':
      return 'tunnel';
    default:
      return reasonCode.replace(/_/g, ' ');
  }
}

export function statusBadgeVariant(status: number): BadgeVariant {
  if (status >= 500) return 'danger';
  if (status >= 400) return 'warning';
  if (status >= 300) return 'info';
  return 'success';
}
