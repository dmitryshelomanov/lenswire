import { File } from 'expo-file-system';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, FileUp, Plus, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Pressable, ScrollView, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { OverrideKind, OverrideRule } from '@/entities/traffic/types';
import {
  contentTypeFromHeaders,
  headersFromEntry,
  useOverrides,
} from '@/features/proxy/hooks/use-overrides';
import {
  guessContentType,
  type HeaderRow,
  headersFromRows,
  newHeaderRowId,
  rowsFromHeaders,
  seedOverrideDraft,
} from '@/features/proxy/lib/override-editor';
import { useProxyEntries } from '@/features/proxy/store';
import { HeaderRowsEditor } from '@/features/proxy/ui/override/header-rows-editor';
import { Section } from '@/features/proxy/ui/request-detail/section';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { ScreenHeader } from '@/shared/ui/screen-header';
import { SwitchRow } from '@/shared/ui/switch-row';
import { Text } from '@/shared/ui/text';

const KIND_OPTIONS: {
  value: OverrideKind;
  label: string;
  short: string;
  hint: string;
}[] = [
  {
    value: 'response',
    label: 'Mock',
    short: 'MOCK',
    hint: 'No upstream call — client gets this status, headers, and body.',
  },
  {
    value: 'request',
    label: 'Rewrite',
    short: 'REWRITE',
    hint: 'Upstream is called with rewritten body and merged headers.',
  },
];

export default function OverrideEditScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    ruleId?: string;
    entryId?: string;
    kind?: string;
  }>();
  const { getEntry, loadFullEntry } = useProxyEntries();
  const { rules, upsertRule, removeRule, ready } = useOverrides();

  const kindParam: OverrideKind = params.kind === 'request' ? 'request' : 'response';
  const existing = params.ruleId ? rules.find((item) => item.id === params.ruleId) : undefined;
  const [entry, setEntry] = React.useState(() =>
    params.entryId ? getEntry(params.entryId) : undefined,
  );
  const [entryReady, setEntryReady] = React.useState(!params.entryId);
  const [draft, setDraft] = React.useState<OverrideRule | null>(null);
  const [headerRows, setHeaderRows] = React.useState<HeaderRow[]>([]);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [pickingFile, setPickingFile] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const entryId = params.entryId;
    if (!entryId) {
      queueMicrotask(() => {
        if (cancelled) return;
        setEntry(undefined);
        setEntryReady(true);
      });
      return;
    }
    queueMicrotask(() => {
      if (cancelled) return;
      setEntryReady(false);
      setEntry(getEntry(entryId));
    });
    void loadFullEntry(entryId).then((full) => {
      queueMicrotask(() => {
        if (cancelled) return;
        setEntry(full ?? undefined);
        setEntryReady(true);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [params.entryId, getEntry, loadFullEntry]);

  React.useEffect(() => {
    if (!ready || !entryReady || draft) return;
    const seeded = seedOverrideDraft(existing, entry, kindParam);
    if (!seeded) return;
    queueMicrotask(() => {
      setDraft(seeded.draft);
      setHeaderRows(seeded.headerRows);
    });
  }, [ready, entryReady, draft, existing, entry, kindParam]);

  const setKind = (kind: OverrideKind) => {
    if (!draft || draft.kind === kind) return;
    if (entry) {
      const isResponse = kind === 'response';
      const headers = isResponse
        ? headersFromEntry(entry.responseHeaders)
        : headersFromEntry(entry.requestHeaders);
      setHeaderRows(rowsFromHeaders(headers));
      setDraft({
        ...draft,
        kind,
        status: isResponse ? entry.status || 200 : draft.status,
        contentType: isResponse
          ? contentTypeFromHeaders(entry.responseHeaders)
          : contentTypeFromHeaders(entry.requestHeaders),
        headers,
        bodyText: isResponse ? (entry.responseBody.text ?? '') : (entry.requestBody.text ?? ''),
      });
    } else {
      setDraft({ ...draft, kind });
    }
    setFileName(null);
  };

  const updateHeaderRows = (nextRows: HeaderRow[]) => {
    setHeaderRows(nextRows);
    setDraft((prev) => (prev ? { ...prev, headers: headersFromRows(nextRows) } : prev));
  };

  const pickFile = async () => {
    if (pickingFile) return;
    setPickingFile(true);
    try {
      const picked = await File.pickFileAsync({
        mimeTypes: [
          'application/json',
          'text/*',
          'application/xml',
          'application/javascript',
          '*/*',
        ],
      });
      if (picked.canceled || !picked.result) return;
      const file = picked.result;
      const text = await file.text();
      const nextType = guessContentType(file.name);
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              bodyText: text,
              contentType: prev.contentType.trim() ? prev.contentType : nextType,
            }
          : prev,
      );
      setFileName(file.name);
    } catch (error) {
      Alert.alert(
        'Could not read file',
        error instanceof Error ? error.message : 'Pick a text/JSON file and try again.',
      );
    } finally {
      setPickingFile(false);
    }
  };

  if (!ready || !entryReady || !draft) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ScreenHeader
          title="Override"
          onBack={() => router.back()}
          backIcon={<Icon as={ArrowLeft} className="text-foreground" size={18} />}
        />
        <Text className="text-muted-foreground p-4">
          {ready && entryReady
            ? 'Create an override from a captured request, or open an existing rule.'
            : 'Loading…'}
        </Text>
      </SafeAreaView>
    );
  }

  const matchLabel = `${draft.method} ${draft.scheme}://${draft.host}${draft.path}${
    draft.query ? `?${draft.query}` : ''
  }`;
  const kindMeta = KIND_OPTIONS.find((item) => item.value === draft.kind) ?? KIND_OPTIONS[0];
  const isResponse = draft.kind === 'response';

  const onSave = () => {
    upsertRule({
      ...draft,
      headers: headersFromRows(headerRows),
      contentType: draft.contentType.trim() || 'application/json',
      status: Number.isFinite(draft.status) && draft.status > 0 ? draft.status : 200,
    });
    router.replace('/overrides');
  };

  const onDelete = () => {
    removeRule(draft.id);
    router.replace('/overrides');
  };

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenHeader
        title={existing ? 'Edit override' : 'New override'}
        onBack={() => router.back()}
        backIcon={<Icon as={ArrowLeft} className="text-foreground" size={18} />}
        right={
          <View className="flex-row items-center gap-1">
            <Badge label={kindMeta.short} variant={isResponse ? 'warning' : 'info'} />
            {existing ? (
              <Button variant="ghost" size="icon" onPress={onDelete} accessibilityLabel="Delete">
                <Icon as={Trash2} className="text-destructive" size={18} />
              </Button>
            ) : null}
          </View>
        }
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-6 px-4 py-5 sm:px-6"
        keyboardShouldPersistTaps="handled"
      >
        <Section title="Matches">
          <Text className="font-mono text-sm" selectable>
            {matchLabel}
          </Text>
          <Text variant="muted" className="mt-1 text-xs">
            Exact method + URL. Tunnel-only HTTPS cannot be overridden.
          </Text>
        </Section>

        <Section title="Kind">
          <OverrideKindPicker kind={draft.kind} onChange={setKind} hint={kindMeta.hint} />
        </Section>

        <Section title="Enabled">
          <SwitchRow
            value={draft.enabled}
            onToggle={() => setDraft((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev))}
          />
        </Section>

        {isResponse ? (
          <Section title="Status">
            <Input
              value={String(draft.status)}
              keyboardType="number-pad"
              onChangeText={(raw) => {
                const status = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10);
                setDraft((prev) =>
                  prev ? { ...prev, status: Number.isFinite(status) ? status : prev.status } : prev,
                );
              }}
              placeholder="200"
            />
          </Section>
        ) : null}

        <Section title="Content-Type">
          <Input
            value={draft.contentType}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(contentType) =>
              setDraft((prev) => (prev ? { ...prev, contentType } : prev))
            }
            placeholder="application/json"
            className="font-mono text-sm"
          />
        </Section>

        <Section title={isResponse ? 'Response headers' : 'Request headers'}>
          <Text variant="muted" className="text-xs">
            {isResponse
              ? 'Set to override · empty value removes · only listed headers are sent with the mock.'
              : 'Set to override · empty value removes · other client headers stay.'}
          </Text>
          <View className="border-border bg-amber-500/10 mt-2 rounded-md border p-3">
            <Text className="text-xs text-amber-700 dark:text-amber-300">
              Content-Type above is applied first. Content-Length / Transfer-Encoding are managed
              automatically.
            </Text>
          </View>
          <HeaderRowsEditor rows={headerRows} onChange={updateHeaderRows} />
          <Button
            variant="outline"
            size="sm"
            className="mt-2 self-start"
            onPress={() =>
              updateHeaderRows([...headerRows, { id: newHeaderRowId(), name: '', value: '' }])
            }
          >
            <Icon as={Plus} className="text-foreground" size={14} />
            <Text className="text-sm">Add header</Text>
          </Button>
        </Section>

        <Section title={isResponse ? 'Response body' : 'Request body'}>
          <Text variant="muted" className="text-xs">
            {isResponse
              ? 'Returned to the client as the response body.'
              : 'Replaces the outgoing request body.'}
          </Text>
          <Button
            variant="outline"
            size="sm"
            className="mt-2 self-start"
            disabled={pickingFile}
            onPress={() => void pickFile()}
          >
            <Icon as={FileUp} className="text-foreground" size={14} />
            <Text className="text-sm">{pickingFile ? 'Opening…' : 'Load from file'}</Text>
          </Button>
          {fileName ? (
            <Text variant="muted" className="mt-1 font-mono text-xs">
              Loaded: {fileName}
            </Text>
          ) : null}
          <TextInput
            value={draft.bodyText}
            onChangeText={(bodyText) => {
              setFileName(null);
              setDraft((prev) => (prev ? { ...prev, bodyText } : prev));
            }}
            multiline
            textAlignVertical="top"
            autoCapitalize="none"
            autoCorrect={false}
            className="border-input bg-background text-foreground mt-2 min-h-[220px] rounded-md border px-3 py-3 font-mono text-sm"
            placeholder={isResponse ? '{ "ok": true }' : '{ "userId": 1, "name": "test" }'}
            placeholderTextColor="hsl(0 0% 63.9%)"
          />
        </Section>
      </ScrollView>

      <View className="border-border bg-background border-t px-4 py-3 sm:px-6">
        <Button onPress={onSave}>
          <Text className="text-primary-foreground font-medium">Apply</Text>
        </Button>
      </View>
    </SafeAreaView>
  );
}

function OverrideKindPicker({
  kind,
  onChange,
  hint,
}: {
  kind: OverrideKind;
  onChange: (kind: OverrideKind) => void;
  hint: string;
}) {
  return (
    <>
      <View className="bg-muted/50 border-border flex-row gap-1 rounded-md border p-1">
        {KIND_OPTIONS.map((option) => {
          const selected = kind === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              className={`flex-1 items-center rounded-md px-3 py-2 ${
                selected ? 'bg-background border-border border' : ''
              }`}
            >
              <Text
                className={`text-sm ${
                  selected ? 'text-foreground font-medium' : 'text-muted-foreground'
                }`}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="muted" className="mt-2 text-xs">
        {hint}
      </Text>
    </>
  );
}
