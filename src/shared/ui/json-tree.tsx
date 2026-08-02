import * as Clipboard from 'expo-clipboard';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, Text as RNText, View } from 'react-native';

import { useThemeStore } from '@/features/theme/store';
import { type JsonSyntaxKind, jsonSyntaxTextStyle } from '@/shared/lib/json-syntax-colors';
import { Icon } from '@/shared/ui/icon';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export type JsonTreeExpandMode = 'default' | 'all' | 'collapsed';

type JsonTreeProps = {
  value: unknown;
  /** Levels expanded on first render (root = 0). Default: 0 (collapsed root). */
  initialExpandDepth?: number;
  /** Force expand/collapse all nodes. Changing this resets expansion state. */
  expandMode?: JsonTreeExpandMode;
  /** Case-insensitive filter; matching nodes stay visible and ancestors stay expanded. */
  searchQuery?: string;
  /** Called after copying path or value via long-press. */
  onCopied?: (kind: 'path' | 'value') => void;
};

type MatchContext = {
  query: string;
  matchingPaths: Set<string>;
};

function entriesOf(
  value: JsonValue,
  kind: 'object' | 'array',
): readonly (readonly [string, JsonValue])[] {
  if (kind === 'array') {
    return (value as JsonValue[]).map((item, index) => [String(index), item] as const);
  }
  return Object.entries(value as Record<string, JsonValue>);
}

function addSubtreePaths(value: JsonValue, path: string, out: Set<string>): void {
  out.add(path);
  const kind = valueKind(value);
  if (kind !== 'object' && kind !== 'array') return;
  for (const [key, child] of entriesOf(value, kind)) {
    addSubtreePaths(child, `${path}.${key}`, out);
  }
}

function collectMatchingPaths(
  value: JsonValue,
  path: string,
  query: string,
  out: Set<string>,
): boolean {
  if (!query) return false;
  const kind = valueKind(value);

  if (kind === 'object' || kind === 'array') {
    let childMatch = false;
    for (const [key, child] of entriesOf(value, kind)) {
      const childPath = `${path}.${key}`;
      if (key.toLowerCase().includes(query)) {
        addSubtreePaths(child, childPath, out);
        childMatch = true;
        continue;
      }
      if (collectMatchingPaths(child, childPath, query, out)) {
        childMatch = true;
      }
    }
    if (childMatch) out.add(path);
    return childMatch;
  }

  const text =
    value === null
      ? 'null'
      : typeof value === 'string'
        ? value
        : typeof value === 'boolean' || typeof value === 'number'
          ? String(value)
          : '';
  const selfMatch = text.toLowerCase().includes(query);
  if (selfMatch) out.add(path);
  return selfMatch;
}

function SyntaxText({
  text,
  kind,
  dark,
  query,
}: {
  text: string;
  kind: JsonSyntaxKind;
  dark: boolean;
  query?: string;
}) {
  const base = jsonSyntaxTextStyle(kind, dark);
  if (!query) {
    return <RNText style={base}>{text}</RNText>;
  }
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let start = 0;
  let idx = lower.indexOf(q, start);
  let key = 0;
  if (idx === -1) {
    return <RNText style={base}>{text}</RNText>;
  }
  while (idx !== -1) {
    if (idx > start) {
      parts.push(
        <RNText key={key++} style={base}>
          {text.slice(start, idx)}
        </RNText>,
      );
    }
    parts.push(
      <RNText key={key++} style={[base, { backgroundColor: 'rgba(245, 158, 11, 0.35)' }]}>
        {text.slice(idx, idx + q.length)}
      </RNText>,
    );
    start = idx + q.length;
    idx = lower.indexOf(q, start);
  }
  if (start < text.length) {
    parts.push(
      <RNText key={key++} style={base}>
        {text.slice(start)}
      </RNText>,
    );
  }
  return <RNText style={base}>{parts}</RNText>;
}

export function JsonTree({
  value,
  initialExpandDepth = 0,
  expandMode = 'default',
  searchQuery = '',
  onCopied,
}: JsonTreeProps) {
  const { resolvedTheme } = useThemeStore();
  const dark = resolvedTheme === 'dark';
  const query = searchQuery.trim().toLowerCase();
  const matchingPaths = React.useMemo(() => {
    const set = new Set<string>();
    if (query) collectMatchingPaths(value as JsonValue, '$', query, set);
    return set;
  }, [value, query]);

  const matchCtx = React.useMemo<MatchContext>(
    () => ({ query, matchingPaths }),
    [query, matchingPaths],
  );

  return (
    <View className="gap-0.5">
      {query && matchingPaths.size === 0 ? (
        <RNText style={jsonSyntaxTextStyle('punct', dark)}>No matches</RNText>
      ) : (
        <JsonNode
          name={null}
          value={value as JsonValue}
          depth={0}
          path="$"
          initialExpandDepth={initialExpandDepth}
          expandMode={expandMode}
          matchCtx={matchCtx}
          dark={dark}
          onCopied={onCopied}
        />
      )}
    </View>
  );
}

type JsonNodeProps = {
  name: string | null;
  value: JsonValue;
  depth: number;
  path: string;
  initialExpandDepth: number;
  expandMode: JsonTreeExpandMode;
  matchCtx: MatchContext;
  dark: boolean;
  onCopied?: (kind: 'path' | 'value') => void;
};

function defaultExpanded(
  depth: number,
  path: string,
  initialExpandDepth: number,
  expandMode: JsonTreeExpandMode,
  matchCtx: MatchContext,
): boolean {
  if (matchCtx.query && matchCtx.matchingPaths.has(path)) return true;
  if (expandMode === 'all') return true;
  if (expandMode === 'collapsed') return false;
  return depth < initialExpandDepth;
}

function JsonNode({
  name,
  value,
  depth,
  path,
  initialExpandDepth,
  expandMode,
  matchCtx,
  dark,
  onCopied,
}: JsonNodeProps) {
  const kind = valueKind(value);
  const isExpandable = kind === 'object' || kind === 'array';
  const desiredExpanded = defaultExpanded(depth, path, initialExpandDepth, expandMode, matchCtx);
  const expandKey = `${path}\0${initialExpandDepth}\0${expandMode}\0${matchCtx.query}\0${matchCtx.matchingPaths.size}`;
  const [expanded, setExpanded] = React.useState(desiredExpanded);
  const [prevExpandKey, setPrevExpandKey] = React.useState(expandKey);
  if (expandKey !== prevExpandKey) {
    setPrevExpandKey(expandKey);
    setExpanded(desiredExpanded);
  }

  const copyPath = React.useCallback(() => {
    void Clipboard.setStringAsync(path).then(() => onCopied?.('path'));
  }, [path, onCopied]);

  const copyValue = React.useCallback(() => {
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    void Clipboard.setStringAsync(text).then(() => onCopied?.('value'));
  }, [value, onCopied]);

  if (matchCtx.query && path !== '$' && !matchCtx.matchingPaths.has(path)) {
    return null;
  }

  if (!isExpandable) {
    return (
      <Pressable
        onLongPress={copyValue}
        accessibilityHint="Long press to copy value"
        className="flex-row flex-wrap items-start py-0.5"
        style={{ paddingLeft: depth * 12 }}
      >
        {name != null ? (
          <Pressable onLongPress={copyPath} accessibilityHint="Long press to copy path">
            <KeyLabel name={name} query={matchCtx.query} dark={dark} />
          </Pressable>
        ) : null}
        <PrimitiveValue value={value} query={matchCtx.query} dark={dark} />
      </Pressable>
    );
  }

  const entries = entriesOf(value, kind);
  const count = entries.length;
  const openBracket = kind === 'array' ? '[' : '{';
  const closeBracket = kind === 'array' ? ']' : '}';
  const preview = kind === 'array' ? `[${count}]` : `{${count}}`;

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={() => setExpanded((prev) => !prev)}
        onLongPress={name != null ? copyPath : copyValue}
        accessibilityHint={name != null ? 'Long press to copy path' : 'Long press to copy value'}
        className="flex-row flex-wrap items-center py-0.5 active:opacity-70"
        style={{ paddingLeft: depth * 12 }}
      >
        <Icon
          as={expanded ? ChevronDown : ChevronRight}
          size={12}
          className="text-muted-foreground mr-0.5"
        />
        {name != null ? <KeyLabel name={name} query={matchCtx.query} dark={dark} /> : null}
        {expanded ? (
          <RNText style={jsonSyntaxTextStyle('punct', dark)}>{openBracket}</RNText>
        ) : (
          <>
            <RNText style={jsonSyntaxTextStyle('punct', dark)}>{preview}</RNText>
            {name == null && depth === 0 ? (
              <RNText style={[jsonSyntaxTextStyle('punct', dark), { marginLeft: 4 }]}>
                {kind === 'array' ? 'Array' : 'Object'}
              </RNText>
            ) : null}
          </>
        )}
      </Pressable>

      {expanded ? (
        <>
          {count === 0 ? (
            <View style={{ paddingLeft: (depth + 1) * 12 + 14 }}>
              <RNText style={[jsonSyntaxTextStyle('punct', dark), { fontStyle: 'italic' }]}>
                empty
              </RNText>
            </View>
          ) : (
            entries.map(([key, child]) => (
              <JsonNode
                key={`${path}.${key}`}
                name={key}
                value={child}
                depth={depth + 1}
                path={`${path}.${key}`}
                initialExpandDepth={initialExpandDepth}
                expandMode={expandMode}
                matchCtx={matchCtx}
                dark={dark}
                onCopied={onCopied}
              />
            ))
          )}
          <View style={{ paddingLeft: depth * 12 + 14 }} className="py-0.5">
            <RNText style={jsonSyntaxTextStyle('punct', dark)}>{closeBracket}</RNText>
          </View>
        </>
      ) : null}
    </View>
  );
}

function KeyLabel({ name, query, dark }: { name: string; query: string; dark: boolean }) {
  return (
    <RNText>
      <SyntaxText text={name} kind="key" dark={dark} query={query} />
      <RNText style={jsonSyntaxTextStyle('punct', dark)}>: </RNText>
    </RNText>
  );
}

function PrimitiveValue({
  value,
  query,
  dark,
}: {
  value: JsonValue;
  query: string;
  dark: boolean;
}) {
  if (value === null) {
    return <SyntaxText text="null" kind="null" dark={dark} />;
  }
  if (typeof value === 'boolean') {
    return <SyntaxText text={String(value)} kind="boolean" dark={dark} query={query} />;
  }
  if (typeof value === 'number') {
    return <SyntaxText text={String(value)} kind="number" dark={dark} query={query} />;
  }
  return <SyntaxText text={JSON.stringify(value)} kind="string" dark={dark} query={query} />;
}

function valueKind(
  value: JsonValue,
): 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value as 'boolean' | 'number' | 'string';
}
