import type { ClientAttributionKind, HeaderMap, TrafficEntry } from './types';

function headerValue(headers: HeaderMap | undefined, wantedLower: string): string | null {
  if (!headers) return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wantedLower) return value;
  }
  return null;
}

export function userAgentOf(headers: HeaderMap | undefined): string | null {
  return headerValue(headers, 'user-agent');
}

function hasAnySecFetch(headers: HeaderMap | undefined): boolean {
  if (!headers) return false;
  for (const [key] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      lower === 'sec-fetch-dest' ||
      lower === 'sec-fetch-mode' ||
      lower === 'sec-fetch-site' ||
      lower === 'sec-fetch-user'
    ) {
      return true;
    }
  }
  return false;
}

function normalizeUa(ua: string): string {
  return ua.trim();
}

function clientNameFromUserAgent(ua: string): string {
  const norm = normalizeUa(ua);
  const lower = norm.toLowerCase();

  // Browsers (priority order matters)
  if (lower.includes('edg/')) return 'Edge';
  if (lower.includes('opr/') || lower.includes('opera/')) return 'Opera';
  if (lower.includes('firefox/')) return 'Firefox';
  if (lower.includes('chrome/') || lower.includes('chromium/')) return 'Chrome';
  if (lower.includes('safari/') && !lower.includes('chrome/') && !lower.includes('chromium/')) {
    return 'Safari';
  }

  // Mobile/native clients
  if (lower.includes('okhttp')) return 'OkHttp';
  if (lower.includes('dalvik/')) return 'Dalvik';
  if (lower.includes('cfnetwork/')) return 'CFNetwork';
  if (lower.includes('electron/')) return 'Electron';

  // Popular apps (best-effort substrings)
  if (lower.includes('instagram')) return 'Instagram';
  if (lower.includes('telegram')) return 'Telegram';
  if (lower.includes('twitter') || lower.includes('twttr')) return 'Twitter';
  if (lower.includes('facebook')) return 'Facebook';
  if (lower.includes('whatsapp')) return 'WhatsApp';
  if (lower.includes('line/')) return 'LINE';
  if (lower.includes('viber')) return 'Viber';

  return 'App';
}

export function clientNameOfEntry(entry: TrafficEntry): string {
  const exactLabel = entry.clientLabel?.trim();
  if (exactLabel) return exactLabel;
  return heuristicClientNameOfEntry(entry);
}

export function heuristicClientNameOfEntry(entry: TrafficEntry): string {
  const ua = userAgentOf(entry.requestHeaders);
  if (!ua) {
    return hasAnySecFetch(entry.requestHeaders) ? 'Browser' : 'Unknown';
  }
  return clientNameFromUserAgent(ua);
}

export function clientAttributionKindOfEntry(entry: TrafficEntry): ClientAttributionKind {
  const raw = entry.clientAttributionKind;
  if (raw === 'exact' || raw === 'heuristic' || raw === 'unknown') {
    return raw;
  }
  if (entry.clientLabel?.trim()) return 'exact';
  const heuristic = heuristicClientNameOfEntry(entry);
  return heuristic === 'Unknown' ? 'unknown' : 'heuristic';
}

export function clientAttributionLabelOfEntry(entry: TrafficEntry): string {
  const kind = clientAttributionKindOfEntry(entry);
  if (kind === 'exact') return 'Exact app';
  if (kind === 'heuristic') return 'Heuristic client';
  return 'Unknown client';
}

// Exported for unit tests.
export { clientNameFromUserAgent };
