import * as React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { useThemeStore } from '@/features/theme/store';
import { type JsonSyntaxKind, jsonSyntaxTextStyle } from '@/shared/lib/json-syntax-colors';

type Token = { kind: JsonSyntaxKind; text: string };

const TOKEN_RE =
  /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\],:]|\s+/g;

const MAX_LINE_CHARS = 4000;
const INITIAL_LINES = 120;
const LOAD_MORE_LINES = 120;

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(line)) != null) {
    if (match.index > last) {
      tokens.push({ kind: 'plain', text: line.slice(last, match.index) });
    }
    const full = match[0];
    if (/^\s+$/.test(full)) {
      tokens.push({ kind: 'plain', text: full });
    } else if (match[1] != null) {
      tokens.push({ kind: match[2] != null ? 'key' : 'string', text: match[1] });
      if (match[2]) tokens.push({ kind: 'punct', text: match[2] });
    } else if (match[3] === 'null') {
      tokens.push({ kind: 'null', text: full });
    } else if (match[3] === 'true' || match[3] === 'false') {
      tokens.push({ kind: 'boolean', text: full });
    } else if (/^-?\d/.test(full)) {
      tokens.push({ kind: 'number', text: full });
    } else {
      tokens.push({ kind: 'punct', text: full });
    }
    last = match.index + full.length;
  }
  if (last < line.length) {
    tokens.push({ kind: 'plain', text: line.slice(last) });
  }
  return tokens;
}

function splitForRender(text: string): string[] {
  const rawLines = text.split('\n');
  const lines: string[] = [];
  for (const line of rawLines) {
    if (line.length <= MAX_LINE_CHARS) {
      lines.push(line);
      continue;
    }
    for (let i = 0; i < line.length; i += MAX_LINE_CHARS) {
      lines.push(line.slice(i, i + MAX_LINE_CHARS));
    }
  }
  return lines;
}

const PrettyLine = React.memo(function PrettyLine({ line, dark }: { line: string; dark: boolean }) {
  const tokens = React.useMemo(() => tokenizeLine(line), [line]);
  return (
    <Text selectable style={jsonSyntaxTextStyle('plain', dark)}>
      {tokens.map((token, tokenIndex) => (
        <Text key={tokenIndex} style={jsonSyntaxTextStyle(token.kind, dark)}>
          {token.text}
        </Text>
      ))}
      {line.length === 0 ? ' ' : null}
    </Text>
  );
});

export function JsonPretty({ text }: { text: string }) {
  const { resolvedTheme } = useThemeStore();
  const dark = resolvedTheme === 'dark';
  const lines = React.useMemo(() => splitForRender(text), [text]);
  const [visibleCount, setVisibleCount] = React.useState(INITIAL_LINES);
  const [prevText, setPrevText] = React.useState(text);
  if (text !== prevText) {
    setPrevText(text);
    setVisibleCount(INITIAL_LINES);
  }

  const visibleLines = lines.slice(0, visibleCount);
  const hasMore = visibleCount < lines.length;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
      keyboardShouldPersistTaps="handled"
    >
      {visibleLines.map((line, index) => (
        <PrettyLine key={index} line={line} dark={dark} />
      ))}
      {hasMore ? (
        <Pressable
          onPress={() => setVisibleCount((n) => Math.min(n + LOAD_MORE_LINES, lines.length))}
          accessibilityRole="button"
          accessibilityLabel="Show more lines"
          style={{ paddingVertical: 12 }}
        >
          <Text style={jsonSyntaxTextStyle('key', dark)}>
            Show more ({lines.length - visibleCount} lines)
          </Text>
        </Pressable>
      ) : (
        <View style={{ height: 24 }} />
      )}
    </ScrollView>
  );
}
