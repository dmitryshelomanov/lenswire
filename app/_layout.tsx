import '../global.css';
import 'react-native-reanimated';

import { PortalHost } from '@rn-primitives/portal';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { ThemeStoreProvider, useThemeStore } from '@/features/theme/store';
import { NAV_THEME } from '@/shared/lib/theme';

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  return (
    <ThemeStoreProvider>
      <RootApp />
    </ThemeStoreProvider>
  );
}

function RootApp() {
  const { resolvedTheme } = useThemeStore();
  const isDark = resolvedTheme === 'dark';

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={isDark ? NAV_THEME.dark : NAV_THEME.light}>
        <View className={isDark ? 'dark flex-1' : 'flex-1'}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="domain/[host]" />
            <Stack.Screen name="request/[id]" />
            <Stack.Screen name="certificate" />
            <Stack.Screen name="settings" />
          </Stack>
          <PortalHost />
        </View>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
