export type RuntimeSlice<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T;
  set: (next: T) => void;
};

export function createRuntimeSlice<T>(initial: T): RuntimeSlice<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot(): T {
      return snapshot;
    },
    set(next: T): void {
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      listeners.forEach((listener) => listener());
    },
  };
}
