import * as React from 'react';
import { useColorScheme } from 'react-native';

import { loadJson, saveJson } from '@/shared/lib/safe-async-storage';

export type ThemePreference = 'system' | 'dark' | 'light';
export type ResolvedTheme = 'dark' | 'light';

type ThemeStoreValue = {
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setThemePreference: (next: ThemePreference) => void;
};

const STORAGE_KEY = 'lenswire.themePreference';
const DEFAULT_THEME_PREFERENCE: ThemePreference = 'system';

const ThemeStoreContext = React.createContext<ThemeStoreValue | null>(null);

function parseThemePreference(value: string | null): ThemePreference | null {
  if (value == null) return DEFAULT_THEME_PREFERENCE;
  // Back-compat: older builds stored a raw string; saveJson stores JSON.
  let raw = value;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (typeof parsed === 'string') raw = parsed;
  } catch {
    // Keep raw string from storage.
  }
  if (raw === 'dark' || raw === 'light' || raw === 'system') {
    return raw;
  }
  return DEFAULT_THEME_PREFERENCE;
}

export function ThemeStoreProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] =
    React.useState<ThemePreference>(DEFAULT_THEME_PREFERENCE);

  React.useEffect(() => {
    let mounted = true;
    loadJson(STORAGE_KEY, parseThemePreference)
      .then((stored) => {
        if (!mounted || !stored) return;
        setThemePreferenceState(stored);
      })
      .catch(() => {
        // Ignore storage errors; fallback stays on system mode.
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setThemePreference = React.useCallback((next: ThemePreference) => {
    setThemePreferenceState(next);
    saveJson(STORAGE_KEY, next);
  }, []);

  const resolvedTheme: ResolvedTheme =
    themePreference === 'system' ? (systemScheme === 'dark' ? 'dark' : 'light') : themePreference;

  const value = React.useMemo<ThemeStoreValue>(
    () => ({
      themePreference,
      resolvedTheme,
      setThemePreference,
    }),
    [themePreference, resolvedTheme, setThemePreference],
  );

  return <ThemeStoreContext.Provider value={value}>{children}</ThemeStoreContext.Provider>;
}

export function useThemeStore(): ThemeStoreValue {
  const ctx = React.useContext(ThemeStoreContext);
  if (!ctx) {
    throw new Error('useThemeStore must be used within ThemeStoreProvider');
  }
  return ctx;
}
