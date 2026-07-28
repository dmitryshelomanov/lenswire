import { useRouter } from 'expo-router';
import { View } from 'react-native';

import type { OverrideKind, TrafficEntry } from '@/entities/traffic/types';
import { Button } from '@/shared/ui/button';
import { Text } from '@/shared/ui/text';

import { canCreateOverride } from '../../hooks/use-overrides';

export function openOverrideEditor(
  router: ReturnType<typeof useRouter>,
  entryId: string,
  kind: OverrideKind,
) {
  router.push({
    pathname: '/override/edit',
    params: { entryId, kind },
  });
}

export function OverrideActionButton({
  entry,
  kind,
  label,
  size = 'default',
}: {
  entry: TrafficEntry;
  kind: OverrideKind;
  label: string;
  size?: 'default' | 'sm';
}) {
  const router = useRouter();
  if (!canCreateOverride(entry)) return null;

  return (
    <Button
      variant="outline"
      size={size}
      onPress={() => openOverrideEditor(router, entry.id, kind)}
    >
      <Text className="text-sm font-medium">{label}</Text>
    </Button>
  );
}

export function OverrideActionLink({
  entry,
  kind,
  label,
}: {
  entry: TrafficEntry;
  kind: OverrideKind;
  label: string;
}) {
  const router = useRouter();
  if (!canCreateOverride(entry)) return null;

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 px-2"
      onPress={() => openOverrideEditor(router, entry.id, kind)}
    >
      <Text className="text-xs font-medium">{label}</Text>
    </Button>
  );
}

export function OverviewOverrideActions({ entry }: { entry: TrafficEntry }) {
  if (!canCreateOverride(entry)) return null;

  return (
    <View className="gap-2">
      <OverrideActionButton entry={entry} kind="request" label="Rewrite request payload" />
      <OverrideActionButton entry={entry} kind="response" label="Mock this response" />
    </View>
  );
}
