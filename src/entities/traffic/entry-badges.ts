import { hasProtobufContentType, httpVersionLabel, isInspectable, reasonLabel } from './badges';
import { grpcVariant, parseGrpcPath } from './grpc';
import { resourceTypeOf } from './resource-type';
import type { ResourceKind, TrafficEntry } from './types';

const STATIC_RESOURCE_LABELS = new Set<ResourceKind>([
  'js',
  'css',
  'font',
  'img',
  'media',
  'doc',
]);

function staticResourceLabel(entry: TrafficEntry): string | null {
  const kind = resourceTypeOf(entry);
  return STATIC_RESOURCE_LABELS.has(kind) ? kind : null;
}

export function getEntryBadgeMeta(entry: TrafficEntry) {
  const variant = grpcVariant(entry);
  return {
    httpVersion: httpVersionLabel(entry),
    reason: reasonLabel(
      entry.reasonCode,
      entry.tlsAlpnProtocols,
      entry.captureSummary,
      entry.bypassCause,
    ),
    inspectable: isInspectable(entry),
    resourceLabel: staticResourceLabel(entry),
    grpcVariant: variant,
    protobuf: hasProtobufContentType(entry),
    grpcPath: variant ? parseGrpcPath(entry.path) : null,
  };
}
