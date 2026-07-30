import { ChevronDown, ChevronRight } from 'lucide-react-native';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { Text } from '@/shared/ui/text';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type JsonTreeProps = {
  value: unknown;
  /** Levels expanded on first render (root = 0). Default: 2. */
  initialExpandDepth?: number;
};

export function JsonTree({ value, initialExpandDepth = 2 }: JsonTreeProps) {
  return (
    <View className="gap-0.5">
      <JsonNode
        name={null}
        value={value as JsonValue}
        depth={0}
        path="$"
        initialExpandDepth={initialExpandDepth}
      />
    </View>
  );
}

type JsonNodeProps = {
  name: string | null;
  value: JsonValue;
  depth: number;
  path: string;
  initialExpandDepth: number;
};

function JsonNode({ name, value, depth, path, initialExpandDepth }: JsonNodeProps) {
  const kind = valueKind(value);
  const isExpandable = kind === 'object' || kind === 'array';
  const [expanded, setExpanded] = React.useState(depth < initialExpandDepth);

  if (!isExpandable) {
    return (
      <View className="flex-row flex-wrap items-start py-0.5" style={{ paddingLeft: depth * 12 }}>
        {name != null ? <KeyLabel name={name} /> : null}
        <PrimitiveValue value={value} />
      </View>
    );
  }

  const entries =
    kind === 'array'
      ? (value as JsonValue[]).map((item, index) => [String(index), item] as const)
      : Object.entries(value as Record<string, JsonValue>);
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
        className="flex-row flex-wrap items-center py-0.5 active:opacity-70"
        style={{ paddingLeft: depth * 12 }}
      >
        <Icon
          as={expanded ? ChevronDown : ChevronRight}
          size={12}
          className="text-muted-foreground mr-0.5"
        />
        {name != null ? <KeyLabel name={name} /> : null}
        {expanded ? (
          <Text className="text-muted-foreground font-mono text-xs">{openBracket}</Text>
        ) : (
          <>
            <Text className="text-muted-foreground font-mono text-xs">{preview}</Text>
            {name == null && depth === 0 ? (
              <Text className="text-muted-foreground ml-1 font-mono text-xs">
                {kind === 'array' ? 'Array' : 'Object'}
              </Text>
            ) : null}
          </>
        )}
      </Pressable>

      {expanded ? (
        <>
          {count === 0 ? (
            <View style={{ paddingLeft: (depth + 1) * 12 + 14 }}>
              <Text className="text-muted-foreground font-mono text-xs italic">empty</Text>
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
              />
            ))
          )}
          <View style={{ paddingLeft: depth * 12 + 14 }} className="py-0.5">
            <Text className="text-muted-foreground font-mono text-xs">{closeBracket}</Text>
          </View>
        </>
      ) : null}
    </View>
  );
}

function KeyLabel({ name }: { name: string }) {
  return (
    <Text className="font-mono text-xs text-sky-500 dark:text-sky-400">
      {name}
      <Text className="text-muted-foreground font-mono text-xs">: </Text>
    </Text>
  );
}

function PrimitiveValue({ value }: { value: JsonValue }) {
  if (value === null) {
    return <Text className="text-muted-foreground font-mono text-xs">null</Text>;
  }
  if (typeof value === 'boolean') {
    return (
      <Text className="font-mono text-xs text-violet-600 dark:text-violet-400">
        {String(value)}
      </Text>
    );
  }
  if (typeof value === 'number') {
    return (
      <Text className="font-mono text-xs text-amber-600 dark:text-amber-400">{String(value)}</Text>
    );
  }
  return (
    <Text className="font-mono text-xs text-emerald-600 dark:text-emerald-400">
      {JSON.stringify(value)}
    </Text>
  );
}

function valueKind(
  value: JsonValue,
): 'null' | 'boolean' | 'number' | 'string' | 'array' | 'object' {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object') return 'object';
  return typeof value as 'boolean' | 'number' | 'string';
}
