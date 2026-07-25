import { useRouter } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useProxyStore } from '@/features/proxy/store';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { Text } from '@/shared/ui/text';

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, status, updateSettings } = useProxyStore();
  const listening = status === 'listening';

  return (
    <SafeAreaView className="dark flex-1 bg-background">
      <View className="border-border flex-row items-center gap-2 border-b px-4 py-3">
        <Button variant="ghost" size="icon" onPress={() => router.back()}>
          <Icon as={ArrowLeft} className="text-foreground" size={18} />
        </Button>
        <Text className="text-lg font-semibold">Settings</Text>
      </View>

      <ScrollView className="flex-1" contentContainerClassName="gap-6 px-4 py-6 sm:px-6">
        {listening ? (
          <Text variant="muted">
            Stop the proxy before changing listen host or port. HTTPS decryption can be toggled any
            time (UI only).
          </Text>
        ) : null}

        <Field label="Listen host">
          <Input
            value={settings.host}
            editable={!listening}
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(host) => updateSettings({ host })}
            placeholder="0.0.0.0"
          />
        </Field>

        <Field label="Port">
          <Input
            value={String(settings.port)}
            editable={!listening}
            keyboardType="number-pad"
            onChangeText={(raw) => {
              const port = Number.parseInt(raw.replace(/[^0-9]/g, ''), 10);
              if (!Number.isFinite(port)) return;
              updateSettings({ port: Math.min(65535, Math.max(1, port)) });
            }}
            placeholder="9090"
          />
        </Field>

        <Field label="HTTPS decryption">
          <Pressable
            onPress={() => updateSettings({ httpsDecrypt: !settings.httpsDecrypt })}
            className="border-border bg-background flex-row items-center justify-between rounded-md border px-3 py-3"
          >
            <Text>{settings.httpsDecrypt ? 'Enabled' : 'Disabled'}</Text>
            <View
              className={`h-6 w-11 justify-center rounded-full px-0.5 ${
                settings.httpsDecrypt ? 'bg-emerald-500/80' : 'bg-muted'
              }`}
            >
              <View
                className={`bg-background h-5 w-5 rounded-full ${
                  settings.httpsDecrypt ? 'self-end' : 'self-start'
                }`}
              />
            </View>
          </Pressable>
          <Text variant="muted" className="mt-2">
            When enabled, the proxy uses the Lenswire CA to decrypt HTTPS. Requires CA install on
            the device.
          </Text>
        </Field>
      </ScrollView>
    </SafeAreaView>
  );
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
