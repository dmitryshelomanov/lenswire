import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PROBES, runProbe, type Probe, type ProbeResult } from '@/probes';

export default function IndexScreen() {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [activeProbe, setActiveProbe] = useState<Probe | null>(null);
  const [result, setResult] = useState<ProbeResult | null>(null);

  async function onProbe(probe: Probe) {
    setLoadingId(probe.id);
    setActiveProbe(probe);
    setResult(null);
    const next = await runProbe(probe);
    setResult(next);
    setLoadingId(null);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          HTTPS probes to jsonplaceholder. Compare the response with Expected live — if it differs
          after a Lenswire mock rule, the mock worked.
        </Text>

        <View style={styles.buttons}>
          {PROBES.map((probe) => {
            const busy = loadingId === probe.id;
            return (
              <Pressable
                key={probe.id}
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  busy && styles.buttonBusy,
                ]}
                disabled={loadingId != null}
                onPress={() => onProbe(probe)}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonLabel}>{probe.label}</Text>
                )}
                <Text style={styles.buttonMeta}>
                  {probe.method} · {shortUrl(probe.url)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {activeProbe != null && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Expected live</Text>
            <Text style={styles.expected}>{activeProbe.expectedLive}</Text>
            <Text style={styles.hint}>
              Match → real API (no mock / decrypt off). Differ → mock likely applied.
            </Text>
          </View>
        )}

        {result != null && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Last response</Text>
            <View style={styles.row}>
              <Text
                style={[
                  styles.status,
                  result.error
                    ? styles.statusError
                    : result.ok
                      ? styles.statusOk
                      : styles.statusWarn,
                ]}
              >
                {result.error ? 'ERR' : result.status != null ? String(result.status) : '—'}
              </Text>
              <Text style={styles.meta}>
                {result.durationMs} ms
                {activeProbe != null ? ` · ${activeProbe.method} ${shortUrl(activeProbe.url)}` : ''}
              </Text>
            </View>

            {result.error != null ? (
              <Text style={styles.errorText}>{result.error}</Text>
            ) : (
              <Text style={styles.body} selectable>
                {result.bodyText || '(empty body)'}
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function shortUrl(url: string): string {
  return url.replace(/^https:\/\//, '');
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  content: {
    padding: 16,
    gap: 16,
    paddingBottom: 32,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: '#3f3f46',
  },
  buttons: {
    gap: 10,
  },
  button: {
    backgroundColor: '#18181b',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonBusy: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonMeta: {
    color: '#a1a1aa',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e4e4e7',
    padding: 14,
    gap: 8,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: '#71717a',
  },
  expected: {
    fontSize: 14,
    lineHeight: 20,
    color: '#18181b',
  },
  hint: {
    fontSize: 12,
    lineHeight: 18,
    color: '#71717a',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    flexWrap: 'wrap',
  },
  status: {
    fontSize: 28,
    fontWeight: '700',
  },
  statusOk: {
    color: '#15803d',
  },
  statusWarn: {
    color: '#b45309',
  },
  statusError: {
    color: '#b91c1c',
  },
  meta: {
    fontSize: 13,
    color: '#52525b',
    flexShrink: 1,
  },
  body: {
    fontFamily: 'Courier',
    fontSize: 12,
    lineHeight: 18,
    color: '#18181b',
  },
  errorText: {
    fontSize: 14,
    color: '#b91c1c',
    lineHeight: 20,
  },
});
