import { Pause, Play, Search, Trash2 } from 'lucide-react-native';
import { Platform, Pressable, ScrollView, View } from 'react-native';

import type { HttpMethod, StatusClass } from '@/entities/traffic/types';
import { useProxyStore } from '@/features/proxy/store';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { Text } from '@/shared/ui/text';

const METHODS: Array<HttpMethod | 'ALL'> = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
const STATUS_CLASSES: Array<StatusClass | 'ALL'> = ['ALL', '2xx', '3xx', '4xx', '5xx'];

export function TrafficToolbar() {
  const { status, recording, filters, setFilters, start, stop, toggleRecording, clear, simulator, probe, probing } =
    useProxyStore();
  const listening = status === 'listening';
  const showProbe = simulator || Platform.OS === 'android';

  return (
    <View className="border-border gap-3 border-b px-4 py-3 sm:px-6">
      <View className="flex-row flex-wrap items-center gap-2">
        <Button
          variant={listening ? 'destructive' : 'default'}
          size="sm"
          onPress={() => void (listening ? stop() : start())}
        >
          <Text>{listening ? 'Stop' : 'Start'}</Text>
        </Button>

        {showProbe ? (
          <Button
            variant="outline"
            size="sm"
            disabled={!listening || probing}
            onPress={() => void probe()}
          >
            <Text>{probing ? 'Sending…' : 'Send test request'}</Text>
          </Button>
        ) : null}

        <Button variant="outline" size="sm" disabled={!listening} onPress={toggleRecording}>
          <Icon as={recording ? Pause : Play} className="text-foreground" size={14} />
          <Text>{recording ? 'Pause' : 'Resume'}</Text>
        </Button>

        <Button variant="outline" size="sm" onPress={() => void clear()}>
          <Icon as={Trash2} className="text-foreground" size={14} />
          <Text>Clear</Text>
        </Button>
      </View>

      <View className="relative">
        <View className="pointer-events-none absolute top-0 bottom-0 left-3 z-10 justify-center">
          <Icon as={Search} className="text-muted-foreground" size={16} />
        </View>
        <Input
          value={filters.query}
          onChangeText={(query) => setFilters({ query })}
          placeholder="Filter by host, path, method, status…"
          className="pl-9"
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2">
          {METHODS.map((method) => {
            const active = filters.method === method;
            return (
              <Chip
                key={method}
                label={method === 'ALL' ? 'All methods' : method}
                active={active}
                onPress={() => setFilters({ method })}
              />
            );
          })}
          <View className="bg-border mx-1 w-px self-stretch" />
          {STATUS_CLASSES.map((statusClass) => {
            const active = filters.statusClass === statusClass;
            return (
              <Chip
                key={statusClass}
                label={statusClass === 'ALL' ? 'All status' : statusClass}
                active={active}
                onPress={() => setFilters({ statusClass })}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-md border px-2.5 py-1.5',
        active ? 'border-foreground bg-secondary' : 'border-border bg-background',
      )}
    >
      <Text variant="small" className={active ? 'text-foreground' : 'text-muted-foreground'}>
        {label}
      </Text>
    </Pressable>
  );
}
