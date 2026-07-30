import { isInspectable } from '@/entities/traffic/badges';
import {
  entryUrl,
  type HeaderMap,
  type TrafficBody,
  type TrafficEntry,
} from '@/entities/traffic/types';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'host',
]);

export function canExportCurl(entry: TrafficEntry): boolean {
  if (entry.method === 'CONNECT') return false;
  if (!isInspectable(entry)) return false;
  return entry.host.length > 0;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function headerLines(headers: HeaderMap): string[] {
  return Object.entries(headers)
    .filter(([name]) => !HOP_BY_HOP.has(name.toLowerCase()))
    .map(([name, value]) => `-H ${shellEscape(`${name}: ${value}`)}`);
}

function bodyArg(body: TrafficBody): string | null {
  if (body.kind === 'empty' || body.size === 0) return null;
  if (body.kind === 'json' || body.kind === 'text') {
    const text = body.text ?? '';
    if (!text) return null;
    return `--data-binary ${shellEscape(text)}`;
  }
  if (body.previewBase64) {
    return `# binary body omitted (preview only, ${body.size} bytes)`;
  }
  return `# binary body omitted (${body.size} bytes)`;
}

/** Build a curl command for a captured request. */
export function toCurl(entry: TrafficEntry): string {
  const url = entryUrl(entry);
  const parts = ['curl', '-X', entry.method, shellEscape(url)];
  parts.push(...headerLines(entry.requestHeaders));
  const body = bodyArg(entry.requestBody);
  if (body) {
    if (body.startsWith('#')) {
      parts.push(`\\\n  ${body}`);
    } else {
      parts.push(body);
    }
  }
  return parts.join(' \\\n  ');
}
