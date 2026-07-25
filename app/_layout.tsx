import '../global.css';

import { PortalHost } from '@rn-primitives/portal';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { ProxyStoreProvider } from '@/features/proxy/store';
import { NAV_THEME } from '@/shared/lib/theme';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={NAV_THEME.dark}>
        <ProxyStoreProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="request/[id]" />
            <Stack.Screen name="certificate" />
            <Stack.Screen name="settings" />
          </Stack>
          <PortalHost />
        </ProxyStoreProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
