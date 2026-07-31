import { Pause, Play, Search, Trash2 } from 'lucide-react-native';
import { View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { Text } from '@/shared/ui/text';

import { METHODS, RESOURCE_TYPES } from '../../lib/traffic-toolbar/constants';
import { hasAdvancedFilters, optionLabel } from '../../lib/traffic-toolbar/helpers';
import type { MethodFilterValue, SchemeFilterValue } from '../../lib/traffic-toolbar/types';
import { useProxyEntries, useProxyFilters, useProxyStatus } from '../../store';
import { FilterSelect } from './filter-select';
import { MoreFilters } from './more-filters';

type Props = {
  showControls?: boolean;
  showFilters?: boolean;
};

export function TrafficToolbar({ showControls = true, showFilters = true }: Props) {
  const { status, recording, start, stop, toggleRecording } = useProxyStatus();
  const { clear } = useProxyEntries();
  const { filters, setFilters } = useProxyFilters();
  const listening = status === 'listening';
  const connecting = status === 'connecting';
  const showToolbar = showControls || showFilters;

  if (!showToolbar) return null;

  const method: MethodFilterValue = filters.method ?? 'ALL';
  const resourceType = filters.resourceType ?? 'ALL';
  const methodLabel = optionLabel(METHODS, method);
  const resourceLabel = optionLabel(RESOURCE_TYPES, resourceType);
  const moreActive = hasAdvancedFilters(filters);

  return (
    <View className="border-border gap-3 border-b px-4 py-3 sm:px-6">
      {showControls ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <Button
            variant={listening || connecting ? 'destructive' : 'default'}
            size="sm"
            disabled={connecting}
            onPress={() => void (listening ? stop() : start())}
          >
            <Text>{connecting ? 'Connecting…' : listening ? 'Stop' : 'Start'}</Text>
          </Button>

          <Button variant="outline" size="sm" disabled={!listening} onPress={toggleRecording}>
            <Icon as={recording ? Pause : Play} className="text-foreground" size={14} />
            <Text>{recording ? 'Pause' : 'Resume'}</Text>
          </Button>

          <Button variant="outline" size="sm" onPress={() => void clear()}>
            <Icon as={Trash2} className="text-foreground" size={14} />
            <Text>Clear</Text>
          </Button>
        </View>
      ) : null}

      {showFilters ? (
        <>
          <View className="flex-row items-center gap-2 rounded-md border border-input bg-background px-3 min-h-10 shadow-sm shadow-black/5">
            <Icon as={Search} className="shrink-0 text-muted-foreground" size={16} />
            <Input
              value={filters.query}
              onChangeText={(query) => setFilters({ query })}
              placeholder="Filter by host, path, method, status…"
              className="min-h-0 w-auto min-w-0 flex-1 border-0 bg-transparent px-0 py-0 shadow-none"
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          <View className="flex-row flex-wrap items-center gap-2">
            <FilterSelect
              title="Method"
              valueLabel={methodLabel}
              active={method !== 'ALL'}
              options={METHODS}
              selected={method}
              onSelect={(next) => setFilters({ method: next as MethodFilterValue })}
            />
            <FilterSelect
              title="Type"
              valueLabel={resourceLabel}
              active={resourceType !== 'ALL'}
              options={RESOURCE_TYPES}
              selected={resourceType}
              onSelect={(next) => setFilters({ resourceType: next as typeof resourceType })}
            />
            <MoreFilters
              active={moreActive}
              statusClass={filters.statusClass ?? 'ALL'}
              scheme={(filters.scheme ?? 'ALL') as SchemeFilterValue}
              captureMode={filters.captureMode ?? 'ALL'}
              overriddenOnly={Boolean(filters.overriddenOnly)}
              onChange={setFilters}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}
