import { View } from 'react-native';

import type { TrafficBody } from '@/entities/traffic/types';
import { JsonTree } from '@/shared/ui/json-tree';
import { Text } from '@/shared/ui/text';

import { useBodyView } from '../../../hooks/use-body-view';
import { BodyMeta, BodyModeChip, CopyActionButton } from './common';

export function TextBodyView({ body }: { body: TrafficBody }) {
  const { mode, setMode, copied, copyBody, parsed, showTree, displayText } = useBodyView(body);

  return (
    <View className="gap-2">
      <BodyMeta body={body} />
      <View className="flex-row items-center gap-1">
        {showTree ? (
          <>
            <BodyModeChip label="Tree" active={mode === 'tree'} onPress={() => setMode('tree')} />
            <BodyModeChip label="Raw" active={mode === 'raw'} onPress={() => setMode('raw')} />
          </>
        ) : null}
        <CopyActionButton copied={copied} label="Copy body" onPress={copyBody} />
      </View>
      <View className="bg-muted/50 border-border rounded-md border p-3">
        {showTree && mode === 'tree' ? (
          <JsonTree value={parsed} />
        ) : (
          <Text className="font-mono text-xs leading-5" selectable>
            {displayText}
          </Text>
        )}
      </View>
    </View>
  );
}
