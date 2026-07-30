import type { HeaderMap } from './types';

/** Case-insensitive header lookup; empty string when missing. */
export function headerValue(headers: HeaderMap, name: string): string {
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) return value;
  }
  return '';
}

/** MIME type from Content-Type (before `;`), lowercased. */
export function contentTypeMime(headers: HeaderMap): string {
  return headerValue(headers, 'content-type').split(';')[0]?.trim().toLowerCase() || '';
}
