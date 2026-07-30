type RuntimePolling = {
  sync: (active: boolean) => void;
  stop: () => void;
};

export function createRuntimePolling(
  refresh: () => void | Promise<void>,
  shouldRefresh: () => boolean,
  intervalMs = 1200,
): RuntimePolling {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function sync(active: boolean): void {
    if (!active) {
      stop();
      return;
    }
    if (timer) return;
    timer = setInterval(() => {
      if (!shouldRefresh() || inFlight) return;
      inFlight = true;
      Promise.resolve()
        .then(() => refresh())
        .catch(() => {
          // Ignore refresh failures; next tick retries.
        })
        .finally(() => {
          inFlight = false;
        });
    }, intervalMs);
  }

  return { sync, stop };
}
