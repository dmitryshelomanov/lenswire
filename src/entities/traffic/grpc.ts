import { contentTypeMime, headerValue } from './headers';
import type { TrafficEntry } from './types';

export type GrpcVariant = 'grpc-web' | 'grpc';

export type GrpcPathParts = {
  packageName: string;
  service: string;
  method: string;
  shortLabel: string;
};

function mimeLooksGrpc(mime: string): boolean {
  if (!mime) return false;
  return (
    mime === 'application/grpc' ||
    mime.startsWith('application/grpc+') ||
    mime.startsWith('application/grpc-web')
  );
}

/** Path like `/package.Service/Method` used by gRPC / gRPC-Web. */
export function parseGrpcPath(path: string): GrpcPathParts | null {
  const bare = (path.split('?')[0] ?? path).replace(/\/+$/, '');
  const parts = bare.split('/').filter(Boolean);
  if (parts.length !== 2) return null;

  const [serviceFull, method] = parts;
  if (!serviceFull || !method) return null;
  if (!serviceFull.includes('.')) return null;
  if (!/^[A-Z][A-Za-z0-9_]*$/.test(method)) return null;

  const lastDot = serviceFull.lastIndexOf('.');
  const packageName = lastDot > 0 ? serviceFull.slice(0, lastDot) : '';
  const service = lastDot >= 0 ? serviceFull.slice(lastDot + 1) : serviceFull;
  if (!service || !/^[A-Z]/.test(service)) return null;

  return {
    packageName,
    service,
    method,
    shortLabel: `${service}/${method}`,
  };
}

export function grpcVariant(entry: TrafficEntry): GrpcVariant | null {
  const reqCt = contentTypeMime(entry.requestHeaders);
  const resCt = contentTypeMime(entry.responseHeaders);
  const xGrpcWeb =
    headerValue(entry.requestHeaders, 'x-grpc-web') ||
    headerValue(entry.responseHeaders, 'x-grpc-web');

  if (
    reqCt.startsWith('application/grpc-web') ||
    resCt.startsWith('application/grpc-web') ||
    Boolean(xGrpcWeb)
  ) {
    return 'grpc-web';
  }

  if (mimeLooksGrpc(reqCt) || mimeLooksGrpc(resCt)) {
    return 'grpc';
  }

  if (parseGrpcPath(entry.path) && entry.method === 'POST') {
    // Path-only heuristic: prefer grpc-web when common browser CORS markers exist.
    const origin = headerValue(entry.requestHeaders, 'origin');
    if (origin) return 'grpc-web';
    return 'grpc';
  }

  return null;
}

export function isGrpcEntry(entry: TrafficEntry): boolean {
  return grpcVariant(entry) != null;
}

export function grpcBadgeLabel(variant: GrpcVariant): string {
  return variant === 'grpc-web' ? 'gRPC-Web' : 'gRPC';
}
