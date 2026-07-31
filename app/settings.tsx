import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, FileDiff, Send } from 'lucide-react-native';
import * as React from 'react';
import { Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAndroidCaContext } from '@/features/proxy/hooks/use-android-ca-context';
import { useOverrides } from '@/features/proxy/hooks/use-overrides';
import { androidChromeWarning } from '@/features/proxy/lib/android-ca-guidance';
import { useProxySettings, useProxyStatus } from '@/features/proxy/store';
import { ProbeTypeModal } from '@/features/proxy/ui/traffic-toolbar/probe-type-modal';
import { type ThemePreference, useThemeStore } from '@/features/theme/store';
import { getDiagnostics } from '@/shared/api/native-proxy';
import { getAppInfo } from '@/shared/lib/app-info';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { ScreenHeader } from '@/shared/ui/screen-header';
import { SwitchRow } from '@/shared/ui/switch-row';
import { Text } from '@/shared/ui/text';

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const { status, probe, probing } = useProxyStatus();
  const { settings, updateSettings } = useProxySettings();
  const { themePreference, setThemePreference } = useThemeStore();
  const { rules } = useOverrides();
  const { showEmulatorTrustCa } = useAndroidCaContext();
  const [probePickerOpen, setProbePickerOpen] = React.useState(false);
  const listening = status === 'listening';
  const enabledOverrides = rules.filter((rule) => rule.enabled).length;
  const diagnostics = safeDiagnostics();
  const appInfo = getAppInfo();

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScreenHeader
        title="Settings"
        onBack={() => router.back()}
        backIcon={<Icon as={ArrowLeft} className="text-foreground" size={18} />}
      />

      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 py-6 sm:px-6">
        <View
          className={`rounded-lg border p-4 ${
            enabledOverrides > 0
              ? 'border-amber-500/40 bg-amber-500/10'
              : 'border-border bg-muted/40'
          }`}
        >
          <View className="flex-row items-start gap-3">
            <View
              className={`mt-0.5 rounded-md p-2 ${
                enabledOverrides > 0 ? 'bg-amber-500/20' : 'bg-background'
              }`}
            >
              <Icon
                as={FileDiff}
                className={
                  enabledOverrides > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-foreground'
                }
                size={20}
              />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text className="text-base font-semibold">Traffic overrides</Text>
                {enabledOverrides > 0 ? (
                  <Badge label={`${enabledOverrides} active`} variant="warning" />
                ) : rules.length > 0 ? (
                  <Badge label="all off" variant="outline" />
                ) : (
                  <Badge label="none" variant="outline" />
                )}
              </View>
              <Text variant="muted">
                Change what another app sends or receives through the proxy.
              </Text>
              <Text variant="muted" className="mt-1">
                • Mock response — client gets your body, server is not called{'\n'}• Rewrite request
                — your payload goes to the server, response is real
              </Text>
              <Text variant="muted" className="mt-1 font-mono text-xs">
                {rules.length === 0
                  ? 'Create from a captured request (Response / Request tab).'
                  : `${rules.length} saved · ${enabledOverrides} enabled`}
              </Text>
            </View>
          </View>
          <Button
            className="mt-4"
            variant={enabledOverrides > 0 ? 'default' : 'outline'}
            onPress={() => router.push('/overrides')}
          >
            <Text
              className={
                enabledOverrides > 0 ? 'text-primary-foreground font-medium' : 'font-medium'
              }
            >
              Open overrides
            </Text>
            <Icon
              as={ChevronRight}
              className={enabledOverrides > 0 ? 'text-primary-foreground' : 'text-foreground'}
              size={16}
            />
          </Button>
        </View>

        <View className="border-border bg-muted/40 rounded-lg border p-4">
          <View className="flex-row items-start gap-3">
            <View className="bg-background mt-0.5 rounded-md p-2">
              <Icon as={Send} className="text-foreground" size={20} />
            </View>
            <View className="min-w-0 flex-1 gap-1">
              <Text className="text-base font-semibold">Send test request</Text>
              <Text variant="muted">
                Send a synthetic request through the local proxy (127.0.0.1) so it appears in the
                traffic list. Start capture first.
              </Text>
            </View>
          </View>
          <Button
            className="mt-4"
            variant="outline"
            disabled={!listening || probing}
            onPress={() => setProbePickerOpen(true)}
          >
            <Text className="font-medium">{probing ? 'Sending…' : 'Send test request'}</Text>
          </Button>
        </View>

        <ProbeTypeModal
          open={probePickerOpen}
          onClose={() => setProbePickerOpen(false)}
          onSelect={(type, nextScheme) => {
            setProbePickerOpen(false);
            void (async () => {
              await probe(type, nextScheme);
              router.replace('/');
            })();
          }}
        />

        <Field label="Local proxy">
          <View className="border-border bg-muted/40 rounded-md border px-3 py-3">
            <Text className="font-mono text-sm">
              {settings.host}:{settings.port}
            </Text>
          </View>
          <Text variant="muted" className="mt-2">
            Listen address is fixed by the on-device VPN proxy. Start capture to inspect traffic
            through this local endpoint.
          </Text>
        </Field>

        <Field label="HTTPS decryption">
          <SwitchRow
            value={settings.httpsDecrypt}
            onLabel="Enabled"
            offLabel="Disabled"
            onToggle={() => updateSettings({ httpsDecrypt: !settings.httpsDecrypt })}
          />
          <Text variant="muted" className="mt-2">
            When enabled, the proxy uses the Lenswire CA to decrypt HTTPS. Requires CA install on
            the device. Certificate-pinned apps stay tunnel-only — unpin separately with Frida /
            objection / LSPosed on a rooted device (Lenswire cannot bypass pinning).
          </Text>
          {Platform.OS === 'android' && settings.httpsDecrypt ? (
            <View className="border-border bg-amber-500/10 mt-3 gap-2 rounded-md border p-3">
              <Text className="font-medium text-amber-700 dark:text-amber-300">
                {showEmulatorTrustCa ? 'Chrome needs System CA' : 'Chrome ignores User CAs'}
              </Text>
              <Text variant="muted">{androidChromeWarning(showEmulatorTrustCa)}</Text>
              <Text variant="muted">
                CA trust ≠ unpinning. Google and many native apps still reject MITM until you unpin
                outside Lenswire (root + Frida / objection / LSPosed).
              </Text>
              <Pressable
                onPress={() => updateSettings({ httpsDecrypt: false })}
                className="border-border bg-background self-start rounded-md border px-3 py-2"
              >
                <Text className="text-sm">Disable decryption now</Text>
              </Pressable>
            </View>
          ) : null}
        </Field>

        <Field label="Theme">
          <View className="bg-muted/50 border-border flex-row gap-2 rounded-md border p-1">
            {THEME_OPTIONS.map((option) => {
              const selected = themePreference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => setThemePreference(option.value)}
                  className={`flex-1 rounded-md px-3 py-2 ${
                    selected ? 'bg-background border-border border' : ''
                  }`}
                >
                  <Text
                    className={`text-center text-sm ${
                      selected ? 'text-foreground font-medium' : 'text-muted-foreground'
                    }`}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text variant="muted" className="mt-2">
            System follows the device appearance. Dark and Light override it for this app.
          </Text>
        </Field>

        <Field label="Android diagnostics">
          <View className="border-border bg-muted/40 rounded-md border p-3">
            <Text className="font-mono text-xs">status: {diagnostics.status}</Text>
            <Text className="font-mono text-xs">
              lastError: {diagnostics.lastError ?? '(none)'}
            </Text>
            {diagnostics.runtime ? (
              Object.entries(diagnostics.runtime).map(([key, value]) => (
                <Text key={key} className="font-mono text-xs">
                  {key}: {renderValue(value)}
                </Text>
              ))
            ) : (
              <Text className="font-mono text-xs">runtime: (empty)</Text>
            )}
          </View>
          <Text variant="muted" className="mt-2">
            {showEmulatorTrustCa
              ? 'Capability matrix: HTTP capture yes; Chrome HTTPS needs System CA (`npm run android:trust-ca` on this emulator); pinned apps need external Frida/LSPosed unpin and may stay tunnel-only. SOCKS is TCP-only (`quicForcedToTcp`) so Chrome QUIC falls back to TCP HTTPS.'
              : 'Capability matrix: HTTP capture yes; Chrome ignores User CAs on Android 7+; pinned apps need external Frida/LSPosed unpin and may stay tunnel-only. SOCKS is TCP-only (`quicForcedToTcp`) so Chrome QUIC falls back to TCP HTTPS.'}
          </Text>
        </Field>

        <Field label="About">
          <Text className="text-base font-semibold">{appInfo.name}</Text>
          <Text variant="muted">Version {appInfo.version}</Text>
          <Text variant="muted">Build {appInfo.build ?? '—'}</Text>
          <Text variant="muted">Author {appInfo.author}</Text>
          <Text variant="muted">License {appInfo.license}</Text>
        </Field>
      </ScrollView>
    </SafeAreaView>
  );
}

function safeDiagnostics() {
  try {
    return getDiagnostics();
  } catch {
    return { status: 'stopped', lastError: null, runtime: null };
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text variant="small" className="text-muted-foreground">
        {label}
      </Text>
      {children}
    </View>
  );
}

function renderValue(value: unknown): string {
  if (value == null) return '(null)';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
