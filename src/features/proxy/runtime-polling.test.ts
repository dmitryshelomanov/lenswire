import { afterEach, describe, expect, it, vi } from 'vitest';

import { createRuntimePolling } from './runtime-polling';

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('createRuntimePolling', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs an immediate tick when sync(true) starts', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(() => Promise.resolve());
    const polling = createRuntimePolling(refresh, () => true, 1000);

    polling.sync(true);
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(2);

    polling.stop();
  });

  it('kick runs a tick while active', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(() => Promise.resolve());
    const polling = createRuntimePolling(refresh, () => true, 5000);

    polling.sync(true);
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(1);

    polling.kick();
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(2);

    polling.stop();
    polling.kick();
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('does not start a second interval on repeated sync(true)', async () => {
    vi.useFakeTimers();
    const refresh = vi.fn(() => Promise.resolve());
    const polling = createRuntimePolling(refresh, () => true, 1000);

    polling.sync(true);
    polling.sync(true);
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    await flushMicrotasks();
    expect(refresh).toHaveBeenCalledTimes(2);

    polling.stop();
  });
});
