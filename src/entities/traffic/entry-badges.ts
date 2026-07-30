import { hasProtobufContentType, httpVersionLabel } from './badges';
import { grpcVariant, parseGrpcPath } from './grpc';
import type { TrafficEntry } from './types';

export function getEntryBadgeMeta(entry: TrafficEntry) {
  const variant = grpcVariant(entry);
  return {
    httpVersion: httpVersionLabel(entry),
    grpcVariant: variant,
    protobuf: hasProtobufContentType(entry),
    grpcPath: variant ? parseGrpcPath(entry.path) : null,
  };
}
