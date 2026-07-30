/** Parse JSON text for tree view; returns null for non-object/array payloads. */
export function parseJsonTreeValue(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!(trimmed.startsWith('{') || trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}
