import { Pause, Play, Search, Trash2 } from 'lucide-react-native';
import * as React from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';

import type { HttpMethod, ProbeScheme, ProbeType, StatusClass } from '@/entities/traffic/types';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { Text } from '@/shared/ui/text';

import { useProxyEntries, useProxyFilters, useProxyStatus } from '../store';

const METHODS: (HttpMethod | 'ALL')[] = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'CONNECT'];
const STATUS_CLASSES: (StatusClass | 'ALL')[] = ['ALL', '2xx', '3xx', '4xx', '5xx'];
const SCHEMES: ('ALL' | 'http' | 'https')[] = ['ALL', 'http', 'https'];
const CAPTURE_MODES: ('ALL' | 'http' | 'mitm' | 'tunnel')[] = ['ALL', 'http', 'mitm', 'tunnel'];
const PROBE_OPTIONS: {
  type: ProbeType;
  label: string;
  pathHint: string;
  bodyHint?: string;
}[] = [
  { type: 'http_get', label: 'GET', pathHint: 'httpbin.org/get' },
  {
    type: 'post_json',
    label: 'POST JSON',
    pathHint: 'httpbin.org/post',
    bodyHint: 'application/json body',
  },
  {
    type: 'post_form_urlencoded',
    label: 'POST Form URL Encoded',
    pathHint: 'httpbin.org/post',
    bodyHint: 'application/x-www-form-urlencoded',
  },
  {
    type: 'post_multipart',
    label: 'POST Multipart Form',
    pathHint: 'httpbin.org/post',
    bodyHint: 'multipart/form-data + file part',
  },
  {
    type: 'get_image',
    label: 'GET Image',
    pathHint: 'httpbin.org/image/png',
    bodyHint: 'binary image response',
  },
];

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
  const showProbe = true;
  const showToolbar = showControls || showFilters;

  if (!showToolbar) return null;

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

          {showProbe ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!listening || probing}
              onPress={() => setProbePickerOpen(true)}
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
      ) : null}

      <ProbeTypeModal
        open={probePickerOpen}
        onClose={() => setProbePickerOpen(false)}
        onSelect={(type, scheme) => {
          setProbePickerOpen(false);
          void probe(type, scheme);
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
                    key={`status-${statusClass}`}
                    label={statusClass === 'ALL' ? 'All status' : statusClass}
                    active={active}
                    onPress={() => setFilters({ statusClass })}
                  />
                );
              })}
              <View className="bg-border mx-1 w-px self-stretch" />
              {SCHEMES.map((scheme) => {
                const active = filters.scheme === scheme;
                return (
                  <Chip
                    key={`scheme-${scheme}`}
                    label={scheme === 'ALL' ? 'All schemes' : scheme.toUpperCase()}
                    active={active}
                    onPress={() => setFilters({ scheme })}
                  />
                );
              })}
              <View className="bg-border mx-1 w-px self-stretch" />
              {CAPTURE_MODES.map((captureMode) => {
                const active = filters.captureMode === captureMode;
                const label =
                  captureMode === 'ALL'
                    ? 'All modes'
                    : captureMode === 'mitm'
                      ? 'MITM'
                      : captureMode === 'tunnel'
                        ? 'TUNNEL'
                        : 'HTTP';
                return (
                  <Chip
                    key={`mode-${captureMode}`}
                    label={label}
                    active={active}
                    onPress={() => setFilters({ captureMode })}
                  />
                );
              })}
              <View className="bg-border mx-1 w-px self-stretch" />
              <Chip
                label="Overridden"
                active={filters.overriddenOnly}
                onPress={() => setFilters({ overriddenOnly: !filters.overriddenOnly })}
              />
            </View>
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

function ProbeTypeModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (type: ProbeType, scheme: ProbeScheme) => void;
}) {
  const [scheme, setScheme] = React.useState<ProbeScheme>('http');

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/55 px-6">
        <View className="bg-background border-border w-full max-w-lg rounded-lg border p-4">
          <Text className="mb-1 text-base font-semibold">Choose probe type</Text>
          <Text variant="muted" className="mb-3 text-sm">
            Send a synthetic request through the local proxy.
          </Text>
          <View className="mb-3 flex-row gap-2">
            <Chip label="HTTP" active={scheme === 'http'} onPress={() => setScheme('http')} />
            <Chip label="HTTPS" active={scheme === 'https'} onPress={() => setScheme('https')} />
          </View>
          <View className="gap-2">
            {PROBE_OPTIONS.map((option) => (
              <Pressable
                key={option.type}
                onPress={() => onSelect(option.type, scheme)}
                className="border-border active:bg-accent/40 rounded-md border px-3 py-2.5"
              >
                <Text className="text-sm font-medium">{option.label}</Text>
                <Text variant="muted" className="mt-0.5 text-xs">
                  {`${scheme}://${option.pathHint}`}
                </Text>
                {option.bodyHint ? (
                  <Text variant="muted" className="text-xs">
                    {option.bodyHint}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
          <Button className="mt-3" variant="outline" size="sm" onPress={onClose}>
            <Text>Cancel</Text>
          </Button>
        </View>
      </View>
    </Modal>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
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
