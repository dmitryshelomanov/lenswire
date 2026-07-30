import { isGrpcEntry } from '@/entities/traffic/grpc';
import type { TrafficBody, TrafficEntry } from '@/entities/traffic/types';
import { Text } from '@/shared/ui/text';

import { BinaryBodyView } from './body-view/binary-body-view';
import { GrpcBinaryBodyView } from './body-view/grpc-binary-body-view';
import { ImageBodyView } from './body-view/image-body-view';
import { TextBodyView } from './body-view/text-body-view';

export function BodyView({ body, entry }: { body: TrafficBody; entry?: TrafficEntry }) {
  if (body.kind === 'empty') {
    return <Text variant="muted">(empty)</Text>;
  }
  if (body.kind === 'image') {
    return <ImageBodyView body={body} />;
  }
  if (body.kind === 'binary') {
    if (entry && isGrpcEntry(entry)) {
      return <GrpcBinaryBodyView body={body} />;
    }
    return <BinaryBodyView body={body} />;
  }

  return <TextBodyView body={body} />;
}
