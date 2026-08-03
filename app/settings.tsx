import { useRouter } from 'expo-router';
import { ArrowLeft, ChevronRight, FileDiff, Send } from 'lucide-react-native';
import * as React from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAndroidCaContext } from '@/features/proxy/hooks/use-android-ca-context';
import { useOverrides } from '@/features/proxy/hooks/use-overrides';
import { androidChromeWarning } from '@/features/proxy/lib/android-ca-guidance';
import {
  CAPTURE_STATUS_ITEMS,
  CAPTURE_STATUSES_INTRO,
} from '@/features/proxy/lib/capture-status-copy';
import { useProxySettings, useProxyStatus } from '@/features/proxy/store';
import { CaptureStatusesIntro } from '@/features/proxy/ui/capture-statuses-intro';
import { ProbeTypeModal } from '@/features/proxy/ui/traffic-toolbar/probe-type-modal';
import { type ThemePreference, useThemeStore } from '@/features/theme/store';
import {
  clearMitmBypass,
  getDiagnostics,
  getMitmBypassHosts,
  type MitmBypassHost,
  removeMitmBypassHost,
} from '@/shared/api/native-proxy';
import { APP_CONTACT_EMAIL, getAppInfo } from '@/shared/lib/app-info';
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
  const [captureIntroOpen, setCaptureIntroOpen] = React.useState(false);
  const [bypassHosts, setBypassHosts] = React.useState<MitmBypassHost[]>([]);
  const listening = status === 'listening';
  const enabledOverrides = rules.filter((rule) => rule.enabled).length;
  const diagnostics = safeDiagnostics();
  const appInfo = getAppInfo();

  const refreshBypassHosts = React.useCallback(() => {
    setBypassHosts(getMitmBypassHosts());
  }, []);

  React.useEffect(() => {
    queueMicrotask(refreshBypassHosts);
    const id = setInterval(refreshBypassHosts, 2000);
    return () => clearInterval(id);
  }, [refreshBypassHosts, listening]);

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

        <Field label="Session MITM bypass">
          <Text variant="muted">
            Hosts that failed MITM once stay tunnel-only until you retry or Stop VPN. Retry removes
            the host from the session bypass list.
          </Text>
          {bypassHosts.length === 0 ? (
            <Text variant="muted" className="mt-2">
              No hosts on the bypass list.
            </Text>
          ) : (
            <View className="mt-2 gap-2">
              {bypassHosts.map((item) => (
                <View
                  key={item.host}
                  className="border-border bg-muted/40 flex-row items-center gap-2 rounded-md border px-3 py-2"
                >
                  <View className="min-w-0 flex-1 gap-1">
                    <Text className="font-mono text-sm" numberOfLines={1}>
                      {item.host}
                    </Text>
                    {item.cause ? (
                      <Badge label={item.cause} variant="outline" className="self-start" />
                    ) : null}
                  </View>
                  <Button
                    variant="outline"
                    size="sm"
                    onPress={() => {
                      removeMitmBypassHost(item.host);
                      refreshBypassHosts();
                    }}
                  >
                    <Text className="text-sm">Retry MITM</Text>
                  </Button>
                </View>
              ))}
              <Button
                variant="outline"
                size="sm"
                onPress={() => {
                  clearMitmBypass();
                  refreshBypassHosts();
                }}
              >
                <Text className="font-medium">Clear all</Text>
              </Button>
            </View>
          )}
        </Field>

        <Field label="Capture statuses">
          <Text variant="muted">{CAPTURE_STATUSES_INTRO.lead}</Text>
          <Text variant="muted" className="mt-1">
            {CAPTURE_STATUSES_INTRO.limits}
          </Text>
          <View className="mt-2 gap-3">
            {CAPTURE_STATUS_ITEMS.map((item) => (
              <View key={item.id} className="gap-1">
                <Badge label={item.label} variant="outline" className="self-start" />
                <Text variant="muted">{item.detail}</Text>
              </View>
            ))}
          </View>
          <Button
            className="mt-3"
            variant="outline"
            size="sm"
            onPress={() => setCaptureIntroOpen(true)}
          >
            <Text className="font-medium">Show intro</Text>
          </Button>
        </Field>

        <CaptureStatusesIntro open={captureIntroOpen} onClose={() => setCaptureIntroOpen(false)} />

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

        <Field label="Capture diagnostics">
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
            {Platform.OS === 'android'
              ? showEmulatorTrustCa
                ? 'Capability matrix: HTTP capture yes; Chrome HTTPS needs System CA (`npm run android:trust-ca` on this emulator); pinned apps need external Frida/LSPosed unpin and may stay tunnel-only. UDP/443 (QUIC) is blocked so browsers fall back to TCP (`quicUdpBlocked`); QUIC payload is not captured (`quicDecrypt: false`).'
                : 'Capability matrix: HTTP capture yes; Chrome ignores User CAs on Android 7+; pinned apps need external Frida/LSPosed unpin and may stay tunnel-only. UDP/443 (QUIC) is blocked so browsers fall back to TCP (`quicUdpBlocked`); QUIC payload is not captured (`quicDecrypt: false`).'
              : 'Capability matrix: HTTP capture yes; HTTPS MITM needs trusted Lenswire CA + decrypt on; pinned apps stay tunnel-only. Full TUN → hev → SOCKS → MITM (no system HTTP proxy). UDP/443 (QUIC) is blocked so clients fall back to TCP; QUIC payload is not captured.'}
          </Text>
        </Field>

        <Field label="About">
          <Text className="text-base font-semibold">{appInfo.name}</Text>
          <Text variant="muted">Version {appInfo.version}</Text>
          <Text variant="muted">Build {appInfo.build ?? '—'}</Text>
          <Text variant="muted">Author {appInfo.author}</Text>
          <Text variant="muted">License {appInfo.license}</Text>
          <Button className="mt-2" variant="outline" onPress={() => openFeedbackEmail(appInfo)}>
            <Text className="font-medium">Send feedback</Text>
          </Button>
        </Field>
      </ScrollView>
    </SafeAreaView>
  );
}

async function openFeedbackEmail(appInfo: ReturnType<typeof getAppInfo>) {
  const subject = 'Lenswire feedback';
  const body = [
    `App: ${appInfo.name} ${appInfo.version} (build ${appInfo.build ?? '—'})`,
    `Platform: ${Platform.OS}`,
    '',
    'Describe your feedback:',
    '',
    '',
  ].join('\n');
  const url = `mailto:${APP_CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  try {
    const supported = await Linking.canOpenURL(url);
    if (!supported) {
      Alert.alert(
        'Unable to open mail',
        'No mail app is available on this device. Email feedback to ' + APP_CONTACT_EMAIL + '.',
      );
      return;
    }
    await Linking.openURL(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Alert.alert('Unable to open mail', message);
  }
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
