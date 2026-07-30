import { Pause, Play, Search, Trash2 } from 'lucide-react-native';
import * as React from 'react';
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
import { ProbeTypeModal } from './probe-type-modal';

type Props = {
  showControls?: boolean;
  showFilters?: boolean;
};

export function TrafficToolbar({ showControls = true, showFilters = true }: Props) {
  const { status, recording, start, stop, toggleRecording, probe, probing } = useProxyStatus();
  const { clear } = useProxyEntries();
  const { filters, setFilters } = useProxyFilters();
  const [probePickerOpen, setProbePickerOpen] = React.useState(false);
  const listening = status === 'listening';
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
            variant={listening ? 'destructive' : 'default'}
            size="sm"
            onPress={() => void (listening ? stop() : start())}
          >
            <Text>{listening ? 'Stop' : 'Start'}</Text>
          </Button>

          <Button
            variant="outline"
            size="sm"
            disabled={!listening || probing}
            onPress={() => setProbePickerOpen(true)}
          >
            <Text>{probing ? 'Sending…' : 'Send test request'}</Text>
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

      <ProbeTypeModal
        open={probePickerOpen}
        onClose={() => setProbePickerOpen(false)}
        onSelect={(type, nextScheme) => {
          setProbePickerOpen(false);
          void probe(type, nextScheme);
        }}
      />

      {showFilters ? (
        <>
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
