import { useRouter } from 'expo-router';
import { Maximize2 } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import type { TrafficBody } from '@/entities/traffic/types';
import { Icon } from '@/shared/ui/icon';
import { JsonTree } from '@/shared/ui/json-tree';
import { Text } from '@/shared/ui/text';

import { useBodyView } from '../../../hooks/use-body-view';
import type { BodyViewerSide } from '../../body-viewer/body-viewer-screen';
import { BodyMeta, BodyModeChip, CopyActionButton } from './common';

export function TextBodyView({
  body,
  entryId,
  side,
}: {
  body: TrafficBody;
  entryId?: string;
  side?: BodyViewerSide;
}) {
  const router = useRouter();
  const { mode, setMode, copied, copyBody, parsed, showTree, displayText } = useBodyView(body);

  const openViewer = () => {
    if (!entryId || !side) return;
    router.push({ pathname: '/body-viewer', params: { entryId, side } });
  };

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
        {entryId && side ? (
          <Pressable
            onPress={openViewer}
            accessibilityRole="button"
            accessibilityLabel="Open body viewer"
            className="flex-row items-center gap-1.5 rounded-md px-2.5 py-1 active:opacity-70"
          >
            <Icon as={Maximize2} size={14} className="text-muted-foreground" />
            <Text className="text-muted-foreground text-xs font-medium">Open</Text>
          </Pressable>
        ) : null}
        <CopyActionButton copied={copied} label="Copy body" onPress={copyBody} />
      </View>
      <View className="bg-muted/50 border-border rounded-md border p-3">
        {showTree && mode === 'tree' ? (
          <JsonTree value={parsed} initialExpandDepth={0} />
        ) : (
          <Text className="font-mono text-xs leading-5" selectable numberOfLines={12}>
            {displayText}
          </Text>
        )}
      </View>
    </View>
  );
}
