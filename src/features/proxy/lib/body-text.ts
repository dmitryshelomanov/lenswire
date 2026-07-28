export function looksLikeJson(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

export function prettyJsonText(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return value;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return value;
  }
}
