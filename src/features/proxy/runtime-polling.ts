type RuntimePolling = {
  sync: (active: boolean) => void;
  stop: () => void;
  /** Run one refresh now if polling is active (e.g. app foreground). */
  kick: () => void;
};

export function createRuntimePolling(
  refresh: () => void | Promise<void>,
  shouldRefresh: () => boolean,
  intervalMs = 1200,
): RuntimePolling {
  let timer: ReturnType<typeof setInterval> | null = null;
  let inFlight = false;
  let pendingKick = false;

  function runTick(): void {
    if (!shouldRefresh() || inFlight) return;
    inFlight = true;
    Promise.resolve()
      .then(() => refresh())
      .catch(() => {
        // Ignore refresh failures; next tick retries.
      })
      .finally(() => {
        inFlight = false;
        if (pendingKick) {
          pendingKick = false;
          runTick();
        }
      });
  }

  function stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    pendingKick = false;
  }

  function sync(active: boolean): void {
    if (!active) {
      stop();
      return;
    }
    if (timer) return;
    // Do not wait a full interval after Start / resume — captures may already exist.
    runTick();
    timer = setInterval(runTick, intervalMs);
  }

  function kick(): void {
    if (!timer) return;
    if (inFlight) {
      pendingKick = true;
      return;
    }
    runTick();
  }

  return { sync, stop, kick };
}
