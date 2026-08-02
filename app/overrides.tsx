import { File } from 'expo-file-system';
import { useRouter } from 'expo-router';
import { ArrowLeft, Download, Pencil, Plus, Upload } from 'lucide-react-native';
import * as React from 'react';
import { Alert, FlatList, Pressable, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OverrideRule } from '@/entities/traffic/types';
import { useOverrides } from '@/features/proxy/hooks/use-overrides';
import {
  buildOverridesExport,
  mergeImportedOverrides,
  parseOverridesImport,
} from '@/features/proxy/lib/overrides-io';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

export default function OverridesScreen() {
  const router = useRouter();
  const { rules, toggleRule, removeRule, replaceAll, ready } = useOverrides();
  const [busy, setBusy] = React.useState(false);

  const onExport = async () => {
    if (busy || rules.length === 0) return;
    setBusy(true);
    try {
      const payload = JSON.stringify(buildOverridesExport(rules), null, 2);
      await Share.share({
        message: payload,
        title: 'lenswire-overrides.json',
      });
    } catch (error) {
      Alert.alert(
        'Export failed',
        error instanceof Error ? error.message : 'Could not share overrides JSON.',
      );
    } finally {
      setBusy(false);
    }
  };

  const onImport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const picked = await File.pickFileAsync({
        mimeTypes: ['application/json', 'text/*', '*/*'],
      });
      if (picked.canceled || !picked.result) return;
      const text = await picked.result.text();
      const imported = parseOverridesImport(text);
      const replaced = imported.filter((rule) => rules.some((item) => item.id === rule.id)).length;
      const apply = () => {
        const next = mergeImportedOverrides(rules, imported);
        replaceAll(next);
        Alert.alert('Imported', `${imported.length} rule(s) merged.`);
      };
      if (replaced > 0) {
        Alert.alert(
          'Replace existing rules?',
          `${replaced} imported id(s) already exist and will be overwritten.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Replace', style: 'destructive', onPress: apply },
          ],
        );
      } else {
        apply();
      }
    } catch (error) {
      Alert.alert(
        'Import failed',
        error instanceof Error ? error.message : 'Could not read overrides JSON.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <View className="border-border flex-row items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onPress={() => router.back()}>
          <Icon as={ArrowLeft} className="text-foreground" size={18} />
        </Button>
        <Text className="flex-1 text-lg font-semibold">Overrides</Text>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy}
          onPress={() => void onImport()}
          accessibilityLabel="Import overrides"
        >
          <Icon as={Upload} className="text-foreground" size={18} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={busy || rules.length === 0}
          onPress={() => void onExport()}
          accessibilityLabel="Export overrides"
        >
          <Icon as={Download} className="text-foreground" size={18} />
        </Button>
      </View>

      {!ready ? (
        <Text className="text-muted-foreground p-4">Loading…</Text>
      ) : rules.length === 0 ? (
        <View className="flex-1 items-center justify-center gap-3 px-8">
          <Icon as={Plus} className="text-muted-foreground" size={28} />
          <Text className="text-center text-base font-medium">No overrides yet</Text>
          <Text variant="muted" className="text-center">
            Open a decrypted request and tap Rewrite / Mock on Overview or next to Body. Rules can
            match exact or regex paths, optional headers, delay, and status-only mocks.
          </Text>
          <Button variant="outline" disabled={busy} onPress={() => void onImport()}>
            <Icon as={Upload} className="text-foreground" size={14} />
            <Text className="text-sm">Import JSON</Text>
          </Button>
        </View>
      ) : (
        <FlatList
          data={rules}
          keyExtractor={(item) => item.id}
          contentContainerClassName="pb-8"
          renderItem={({ item }) => (
            <OverrideRow
              rule={item}
              onToggle={() => toggleRule(item.id)}
              onEdit={() =>
                router.push({ pathname: '/override/edit', params: { ruleId: item.id } })
              }
              onDelete={() => {
                Alert.alert('Delete override?', `Remove rule for ${item.host}${item.path}?`, [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: () => removeRule(item.id),
                  },
                ]);
              }}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function OverrideRow({
  rule,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: OverrideRule;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const pathLabel = `${rule.path}${rule.query ? `?${rule.query}` : ''}`;
  return (
    <View className="border-border border-b px-4 py-3 sm:px-6">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge
          label={rule.kind === 'response' ? 'MOCK RES' : 'REWRITE'}
          variant={rule.kind === 'response' ? 'warning' : 'info'}
        />
        <Badge label={rule.method} variant="default" />
        {rule.pathMatch === 'regex' ? <Badge label="regex" variant="outline" /> : null}
        {rule.bodyMode === 'statusOnly' ? <Badge label="status" variant="outline" /> : null}
        {(rule.delayMs ?? 0) > 0 ? <Badge label={`${rule.delayMs}ms`} variant="outline" /> : null}
        {Object.keys(rule.matchHeaders ?? {}).length > 0 ? (
          <Badge label={`${Object.keys(rule.matchHeaders ?? {}).length} match`} variant="outline" />
        ) : null}
        {Object.keys(rule.headers ?? {}).length > 0 ? (
          <Badge label={`${Object.keys(rule.headers ?? {}).length} hdr`} variant="outline" />
        ) : null}
        {!rule.enabled ? <Badge label="off" variant="outline" /> : null}
        <Pressable onPress={onToggle} className="ml-auto">
          <View
            className={`h-6 w-11 justify-center rounded-full px-0.5 ${
              rule.enabled ? 'bg-emerald-500/80' : 'bg-muted'
            }`}
          >
            <View
              className={`bg-background h-5 w-5 rounded-full ${
                rule.enabled ? 'self-end' : 'self-start'
              }`}
            />
          </View>
        </Pressable>
      </View>
      <Text className="mt-2 font-mono text-sm" numberOfLines={1}>
        {rule.host}
        {pathLabel}
      </Text>
      <Text variant="muted" className="mt-1 font-mono text-xs" numberOfLines={1}>
        {rule.scheme} · {rule.contentType || 'no content-type'}
        {rule.kind === 'response' ? ` · ${rule.status}` : ''}
      </Text>
      <View className="mt-3 flex-row gap-2">
        <Button variant="outline" size="sm" onPress={onEdit}>
          <Icon as={Pencil} className="text-foreground" size={14} />
          <Text className="text-sm">Edit</Text>
        </Button>
        <Button variant="ghost" size="sm" onPress={onDelete}>
          <Text className="text-destructive text-sm">Delete</Text>
        </Button>
      </View>
    </View>
  );
}
