import { Check, ChevronsDownUp, ChevronsUpDown, X } from 'lucide-react-native';
import * as React from 'react';
import { ActivityIndicator, InteractionManager, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { TrafficBody } from '@/entities/traffic/types';
import { useCopiedFeedback } from '@/features/proxy/hooks/use-copied-feedback';
import { looksLikeJson, prettyJsonText } from '@/features/proxy/lib/body-text';
import {
  BodyModeChip,
  CopyActionButton,
} from '@/features/proxy/ui/request-detail/body-view/common';
import { parseJsonTreeValue } from '@/shared/lib/parse-json-tree-value';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { JsonPretty } from '@/shared/ui/json-pretty';
import { JsonTree, type JsonTreeExpandMode } from '@/shared/ui/json-tree';
import { Text } from '@/shared/ui/text';

export type BodyViewerSide = 'request' | 'response';

type ViewerMode = 'tree' | 'pretty' | 'raw';

type BodyViewerScreenProps = {
  title: string;
  body: TrafficBody | null;
  loading: boolean;
  onClose: () => void;
};

export function BodyViewerScreen({ title, body, loading, onClose }: BodyViewerScreenProps) {
  const rawText = body?.text ?? '';
  const isJsonLike = Boolean(body && (body.kind === 'json' || looksLikeJson(rawText)));
  const parsed = React.useMemo(
    () => (isJsonLike ? parseJsonTreeValue(rawText) : null),
    [isJsonLike, rawText],
  );
  const showTree = parsed != null;

  const [mode, setMode] = React.useState<ViewerMode>('tree');
  const [search, setSearch] = React.useState('');
  const [expandMode, setExpandMode] = React.useState<JsonTreeExpandMode>('default');
  const [expandEpoch, setExpandEpoch] = React.useState(0);
  const { copied, copy } = useCopiedFeedback();
  const [treeCopied, setTreeCopied] = React.useState<'path' | 'value' | null>(null);
  const treeCopiedReset = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prettyText, setPrettyText] = React.useState<string | null>(null);
  const [prettyPreparing, setPrettyPreparing] = React.useState(false);

  const setExpand = React.useCallback((next: JsonTreeExpandMode) => {
    setExpandMode(next);
    setExpandEpoch((n) => n + 1);
  }, []);

  React.useEffect(() => {
    return () => {
      if (treeCopiedReset.current) clearTimeout(treeCopiedReset.current);
    };
  }, []);

  // Fall back via derived activeMode when JSON can't be parsed as a tree (e.g. truncated).
  const activeMode: ViewerMode = !isJsonLike
    ? 'raw'
    : mode === 'tree' && !showTree
      ? 'pretty'
      : mode;

  // Build pretty text off the critical path so switching tabs doesn't freeze the UI.
  React.useEffect(() => {
    if (activeMode !== 'pretty' || !isJsonLike) {
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPrettyPreparing(true);
      setPrettyText(null);
    });
    const task = InteractionManager.runAfterInteractions(() => {
      const next = prettyJsonText(rawText);
      if (!cancelled) {
        setPrettyText(next);
        setPrettyPreparing(false);
      }
    });
    return () => {
      cancelled = true;
      task.cancel?.();
    };
  }, [activeMode, isJsonLike, rawText]);

  const showPrettyPreparing = activeMode === 'pretty' && isJsonLike && prettyPreparing;
  const onTreeCopied = React.useCallback((kind: 'path' | 'value') => {
    setTreeCopied(kind);
    if (treeCopiedReset.current) clearTimeout(treeCopiedReset.current);
    treeCopiedReset.current = setTimeout(() => setTreeCopied(null), 1500);
  }, []);

  const copyBody = React.useCallback(() => {
    if (activeMode === 'raw') {
      void copy(rawText);
      return;
    }
    void copy(prettyText ?? prettyJsonText(rawText));
  }, [activeMode, copy, prettyText, rawText]);

  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="border-border flex-row items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onPress={onClose} accessibilityLabel="Close">
          <Icon as={X} className="text-foreground" size={18} />
        </Button>
        <Text className="flex-1 text-lg font-semibold">{title}</Text>
        {treeCopied ? (
          <View className="flex-row items-center gap-1">
            <Icon as={Check} size={14} className="text-emerald-500" />
            <Text className="text-xs font-medium text-emerald-500">
              {treeCopied === 'path' ? 'Path copied' : 'Value copied'}
            </Text>
          </View>
        ) : (
          <CopyActionButton copied={copied} label="Copy body" onPress={copyBody} />
        )}
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : !body || body.kind === 'empty' ? (
        <View className="flex-1 items-center justify-center px-6">
          <Text variant="muted">(empty)</Text>
        </View>
      ) : (
        <View className="flex-1">
          <View className="border-border gap-2 border-b px-4 py-3">
            <View className="flex-row flex-wrap items-center gap-1">
              {isJsonLike ? (
                <>
                  {showTree ? (
                    <BodyModeChip
                      label="Tree"
                      active={activeMode === 'tree'}
                      onPress={() => setMode('tree')}
                    />
                  ) : null}
                  <BodyModeChip
                    label="Pretty"
                    active={activeMode === 'pretty'}
                    onPress={() => setMode('pretty')}
                  />
                  <BodyModeChip
                    label="Raw"
                    active={activeMode === 'raw'}
                    onPress={() => setMode('raw')}
                  />
                </>
              ) : null}
              {showTree && activeMode === 'tree' ? (
                <View className="ml-auto flex-row items-center gap-1">
                  <ToolbarIconButton
                    label="Expand all"
                    icon={ChevronsUpDown}
                    onPress={() => setExpand('all')}
                  />
                  <ToolbarIconButton
                    label="Collapse all"
                    icon={ChevronsDownUp}
                    onPress={() => setExpand('collapsed')}
                  />
                </View>
              ) : null}
            </View>
            {showTree && activeMode === 'tree' ? (
              <Input
                value={search}
                onChangeText={setSearch}
                placeholder="Search keys and values…"
                autoCapitalize="none"
                autoCorrect={false}
                clearButtonMode="while-editing"
                className="min-h-9"
              />
            ) : null}
          </View>

          <View className="flex-1">
            {activeMode === 'tree' && parsed != null ? (
              <ScrollView
                className="flex-1"
                contentContainerClassName="px-4 py-4"
                keyboardShouldPersistTaps="handled"
              >
                <JsonTree
                  key={`tree-${expandMode}-${expandEpoch}`}
                  value={parsed}
                  initialExpandDepth={0}
                  expandMode={expandMode}
                  searchQuery={search}
                  onCopied={onTreeCopied}
                />
              </ScrollView>
            ) : activeMode === 'pretty' && isJsonLike ? (
              showPrettyPreparing || prettyText == null ? (
                <View className="flex-1 items-center justify-center">
                  <ActivityIndicator />
                </View>
              ) : (
                <JsonPretty text={prettyText} />
              )
            ) : (
              <ScrollView className="flex-1" contentContainerClassName="px-4 py-4">
                <Text className="font-mono text-xs leading-5" selectable>
                  {rawText}
                </Text>
              </ScrollView>
            )}
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function ToolbarIconButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: typeof ChevronsUpDown;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-md px-2 py-1 active:opacity-70"
    >
      <Icon as={icon} size={16} className="text-muted-foreground" />
    </Pressable>
  );
}
