import { useRouter } from 'expo-router';
import { ArrowLeft, Check, Copy, Share2 } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Share, View } from 'react-native';

import { methodBadgeVariant, statusBadgeVariant } from '@/entities/traffic/badges';
import { entryUrl, formatDuration, type TrafficEntry } from '@/entities/traffic/types';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

import { useCopiedFeedback } from '../../hooks/use-copied-feedback';
import { canExportCurl, toCurl } from '../../lib/to-curl';
import { canExportHar, toHar } from '../../lib/to-har';

export function RequestDetailHeader({ entry }: { entry: TrafficEntry }) {
  const router = useRouter();
  const { copied, copy } = useCopiedFeedback();
  const curlOk = canExportCurl(entry);
  const harOk = canExportHar(entry);

  const onCopyCurl = React.useCallback(() => {
    if (!curlOk) {
      Alert.alert(
        'Cannot export cURL',
        'Tunnel-only CONNECT captures have no HTTP request to export.',
      );
      return;
    }
    void copy(toCurl(entry));
  }, [copy, curlOk, entry]);

  const onShareHar = React.useCallback(() => {
    if (!harOk) {
      Alert.alert('Cannot export HAR', 'This capture cannot be exported as HAR.');
      return;
    }
    void Share.share({ message: toHar(entry), title: `lenswire-${entry.id}.har` });
  }, [entry, harOk]);

  return (
    <View className="border-border border-b px-4 py-3">
      <View className="flex-row items-center gap-2">
        <Button variant="ghost" size="icon" onPress={() => router.back()}>
          <Icon as={ArrowLeft} className="text-foreground" size={18} />
        </Button>
        <Badge label={entry.method} variant={methodBadgeVariant(entry.method)} />
        <Badge label={String(entry.status)} variant={statusBadgeVariant(entry.status)} />
        <Text variant="muted" className="ml-auto font-mono text-xs">
          {formatDuration(entry.timing.totalMs)}
        </Text>
      </View>
      <Text className="mt-2 font-mono text-sm" numberOfLines={2}>
        {entryUrl(entry)}
      </Text>
      <View className="mt-2 flex-row flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={!curlOk} onPress={onCopyCurl}>
          <Icon
            as={copied ? Check : Copy}
            size={14}
            className={copied ? 'text-emerald-500' : 'text-foreground'}
          />
          <Text>{copied ? 'Copied' : 'Copy as cURL'}</Text>
        </Button>
        <Button variant="outline" size="sm" disabled={!harOk} onPress={onShareHar}>
          <Icon as={Share2} size={14} className="text-foreground" />
          <Text>Share HAR</Text>
        </Button>
      </View>
    </View>
  );
}
