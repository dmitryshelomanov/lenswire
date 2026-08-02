import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Check, Copy, Share2 } from 'lucide-react-native';
import * as React from 'react';
import { ScrollView, Share, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { entryUrl, formatBytes, type TrafficEntry } from '@/entities/traffic/types';
import { useCopiedFeedback } from '@/features/proxy/hooks/use-copied-feedback';
import { diffHeaders, diffTextLines } from '@/features/proxy/lib/request-diff';
import { toCompareDiff } from '@/features/proxy/lib/to-compare-diff';
import { useProxyEntries } from '@/features/proxy/store';
import { Section } from '@/features/proxy/ui/request-detail/section';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { ScreenHeader } from '@/shared/ui/screen-header';
import { Text } from '@/shared/ui/text';

export default function CompareScreen() {
  const router = useRouter();
  const { a, b } = useLocalSearchParams<{ a?: string; b?: string }>();
  const { getEntry, loadFullEntry } = useProxyEntries();
  const { copied, copy } = useCopiedFeedback();
  const [left, setLeft] = React.useState<TrafficEntry | null>(null);
  const [right, setRight] = React.useState<TrafficEntry | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const leftId = typeof a === 'string' ? a : '';
    const rightId = typeof b === 'string' ? b : '';
    if (!leftId || !rightId) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    queueMicrotask(() => setLoading(true));
    void (async () => {
      const [fullA, fullB] = await Promise.all([loadFullEntry(leftId), loadFullEntry(rightId)]);
      if (cancelled) return;
      setLeft(fullA ?? getEntry(leftId) ?? null);
      setRight(fullB ?? getEntry(rightId) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [a, b, getEntry, loadFullEntry]);

  const ready = Boolean(left && right);

  const onCopyDiff = React.useCallback(() => {
    if (!left || !right) return;
    void copy(toCompareDiff(left, right));
  }, [copy, left, right]);

  const onShareDiff = React.useCallback(() => {
    if (!left || !right) return;
    void Share.share({
      message: toCompareDiff(left, right),
      title: 'lenswire-compare.diff',
    });
  }, [left, right]);

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenHeader
        title="Compare"
        onBack={() => router.back()}
        backIcon={<Icon as={ArrowLeft} className="text-foreground" size={18} />}
        right={
          ready ? (
            <View className="flex-row items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onPress={onCopyDiff}
                accessibilityLabel="Copy diff"
              >
                <Icon as={copied ? Check : Copy} className="text-foreground" size={18} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onPress={onShareDiff}
                accessibilityLabel="Share diff"
              >
                <Icon as={Share2} className="text-foreground" size={18} />
              </Button>
            </View>
          ) : null
        }
      />
      {loading ? (
        <Text className="text-muted-foreground p-4">Loading…</Text>
      ) : !left || !right ? (
        <View className="gap-3 p-4">
          <Text className="text-base font-medium">Missing requests</Text>
          <Text variant="muted">Pick two requests from a domain list to compare.</Text>
          <Button variant="outline" onPress={() => router.back()}>
            <Text>Go back</Text>
          </Button>
        </View>
      ) : (
        <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 py-5 sm:px-6">
          <Section title="Overview">
            <CompareMeta left={left} right={right} />
          </Section>
          <Section title="Request headers">
            <HeaderDiffTable rows={diffHeaders(left.requestHeaders, right.requestHeaders)} />
          </Section>
          <Section title="Response headers">
            <HeaderDiffTable rows={diffHeaders(left.responseHeaders, right.responseHeaders)} />
          </Section>
          <Section title="Request body">
            <BodyDiff left={left} right={right} which="request" />
          </Section>
          <Section title="Response body">
            <BodyDiff left={left} right={right} which="response" />
          </Section>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CompareMeta({ left, right }: { left: TrafficEntry; right: TrafficEntry }) {
  return (
    <View className="gap-3">
      <MetaColumn label="A" entry={left} />
      <MetaColumn label="B" entry={right} />
    </View>
  );
}

function MetaColumn({ label, entry }: { label: string; entry: TrafficEntry }) {
  return (
    <View className="border-border bg-muted/40 gap-1 rounded-md border p-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <Badge label={label} variant="outline" />
        <Badge label={entry.method} variant="default" />
        <Badge label={String(entry.status)} variant="outline" />
      </View>
      <Text className="font-mono text-xs" selectable>
        {entryUrl(entry)}
      </Text>
    </View>
  );
}

function HeaderDiffTable({ rows }: { rows: ReturnType<typeof diffHeaders> }) {
  if (rows.length === 0) {
    return <Text variant="muted">No headers</Text>;
  }
  return (
    <View className="gap-2">
      {rows.map((row) => (
        <View
          key={row.key}
          className={`rounded-md border px-3 py-2 ${
            row.side === 'same'
              ? 'border-border bg-background'
              : 'border-amber-500/40 bg-amber-500/10'
          }`}
        >
          <Text className="font-mono text-xs font-semibold">{row.key}</Text>
          {row.side === 'same' ? (
            <Text variant="muted" className="mt-0.5 font-mono text-xs">
              {row.left}
            </Text>
          ) : (
            <View className="mt-1 gap-1">
              {row.left != null ? (
                <Text className="font-mono text-xs text-sky-700 dark:text-sky-300">
                  A: {row.left}
                </Text>
              ) : null}
              {row.right != null ? (
                <Text className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                  B: {row.right}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function BodyDiff({
  left,
  right,
  which,
}: {
  left: TrafficEntry;
  right: TrafficEntry;
  which: 'request' | 'response';
}) {
  const lb = which === 'request' ? left.requestBody : left.responseBody;
  const rb = which === 'request' ? right.requestBody : right.responseBody;
  const leftText = lb.kind === 'text' || lb.kind === 'json' ? (lb.text ?? '') : '';
  const rightText = rb.kind === 'text' || rb.kind === 'json' ? (rb.text ?? '') : '';

  if ((lb.kind !== 'text' && lb.kind !== 'json') || (rb.kind !== 'text' && rb.kind !== 'json')) {
    return (
      <View className="gap-1">
        <Text variant="muted" className="font-mono text-xs">
          A: {lb.kind} · {formatBytes(lb.size)}
        </Text>
        <Text variant="muted" className="font-mono text-xs">
          B: {rb.kind} · {formatBytes(rb.size)}
        </Text>
      </View>
    );
  }

  const rows = diffTextLines(leftText, rightText);
  return (
    <View className="gap-1">
      {rows.slice(0, 200).map((row, index) => (
        <View
          key={`${index}-${row.side}`}
          className={`rounded-sm px-2 py-0.5 ${row.side === 'same' ? '' : 'bg-amber-500/10'}`}
        >
          {row.side === 'same' ? (
            <Text className="font-mono text-xs">{row.left}</Text>
          ) : (
            <View className="gap-0.5">
              {row.left != null ? (
                <Text className="font-mono text-xs text-sky-700 dark:text-sky-300">
                  A: {row.left}
                </Text>
              ) : null}
              {row.right != null ? (
                <Text className="font-mono text-xs text-emerald-700 dark:text-emerald-300">
                  B: {row.right}
                </Text>
              ) : null}
            </View>
          )}
        </View>
      ))}
      {rows.length > 200 ? (
        <Text variant="muted" className="mt-1 text-xs">
          Showing first 200 lines…
        </Text>
      ) : null}
    </View>
  );
}
