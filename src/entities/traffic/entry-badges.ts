import { hasProtobufContentType, httpVersionLabel, isInspectable, reasonLabel } from './badges';
import { grpcVariant, parseGrpcPath } from './grpc';
import type { TrafficEntry } from './types';

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
    grpcVariant: variant,
    protobuf: hasProtobufContentType(entry),
    grpcPath: variant ? parseGrpcPath(entry.path) : null,
  };
}
