type SafeAsyncStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

let cachedStorage: SafeAsyncStorage | null | undefined;

export function getSafeAsyncStorage(): SafeAsyncStorage | null {
  if (cachedStorage !== undefined) return cachedStorage;
  try {
    // Optional native module — require so web/SSR builds still load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native dependency
    const mod = require('@react-native-async-storage/async-storage');
    cachedStorage = (mod?.default ?? mod) as SafeAsyncStorage;
  } catch {
    cachedStorage = null;
  }
  return cachedStorage;
}

export async function loadJson<T>(
  key: string,
  parse: (value: string | null) => T | null,
): Promise<T | null> {
  const storage = getSafeAsyncStorage();
  if (!storage) return null;
  try {
    const stored = await storage.getItem(key);
    return parse(stored);
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  const storage = getSafeAsyncStorage();
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(value)).catch(() => {
      // Ignore storage errors; runtime state still updates.
    });
  } catch {
    // Some dev builds throw synchronously when native module is missing.
  }
}
