import { Platform, type TextStyle } from 'react-native';

export type JsonSyntaxKind = 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punct' | 'plain';

const LIGHT: Record<JsonSyntaxKind, string> = {
  key: '#0ea5e9', // sky-500
  string: '#059669', // emerald-600
  number: '#d97706', // amber-600
  boolean: '#7c3aed', // violet-600
  null: '#737373',
  punct: '#737373',
  plain: '#0a0a0a',
};

const DARK: Record<JsonSyntaxKind, string> = {
  key: '#38bdf8', // sky-400
  string: '#34d399', // emerald-400
  number: '#fbbf24', // amber-400
  boolean: '#a78bfa', // violet-400
  null: '#a3a3a3',
  punct: '#a3a3a3',
  plain: '#fafafa',
};

export function jsonSyntaxColor(kind: JsonSyntaxKind, dark: boolean): string {
  return (dark ? DARK : LIGHT)[kind];
}

export function jsonSyntaxTextStyle(kind: JsonSyntaxKind, dark: boolean): TextStyle {
  return {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 20,
    color: jsonSyntaxColor(kind, dark),
  };
}
