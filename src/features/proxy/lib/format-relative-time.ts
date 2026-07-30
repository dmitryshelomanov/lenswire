/** Compact relative time for list rows (`12s`, `3m`, `2h`, `5d`). */
export function formatRelativeTime(timestampMs: number, nowMs: number = Date.now()): string {
  const deltaSec = Math.max(0, Math.floor((nowMs - timestampMs) / 1000));
  if (deltaSec < 60) return `${deltaSec}s`;
  const deltaMin = Math.floor(deltaSec / 60);
  if (deltaMin < 60) return `${deltaMin}m`;
  const deltaHour = Math.floor(deltaMin / 60);
  if (deltaHour < 48) return `${deltaHour}h`;
  const deltaDay = Math.floor(deltaHour / 24);
  return `${deltaDay}d`;
}
