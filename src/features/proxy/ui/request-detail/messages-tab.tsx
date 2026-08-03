import { useRouter } from 'expo-router';
import * as React from 'react';
import { Pressable, View } from 'react-native';

import {
  formatBytes,
  formatDuration,
  type TrafficEntry,
  type WsFrame,
} from '@/entities/traffic/types';
import {
  findNewerWsReconnect,
  findPreviousWsSession,
  findWsCaptureBlocker,
  wsCaptureBlockerMessage,
  wsFramesMissingFromEntry,
} from '@/features/proxy/lib/ws-session-links';
import { useProxyEntries } from '@/features/proxy/store';
import { Button } from '@/shared/ui/button';
import { Text } from '@/shared/ui/text';

import { BodyView } from './body-view';

function hasWsMessages(entry: TrafficEntry): boolean {
  if ((entry.wsFrames?.length ?? 0) > 0) return true;
  if ((entry.wsFrameCount ?? 0) > 0) return true;
  return (
    entry.reasonCode === 'websocket_frames' ||
    entry.reasonCode === 'websocket_relay' ||
    entry.status === 101
  );
}

function opcodeLabel(opcode: string): string {
  switch (opcode) {
    case 'text':
      return 'Text';
    case 'binary':
      return 'Binary';
    case 'ping':
      return 'Ping';
    case 'pong':
      return 'Pong';
    case 'close':
      return 'Close';
    case 'continuation':
      return 'Continuation';
    default:
      return opcode;
  }
}

function sessionStatusLine(entry: TrafficEntry): string {
  if (entry.wsClosed) {
    const parts = ['Closed'];
    if (entry.wsEndReason) parts.push(entry.wsEndReason);
    if (entry.wsCloseCode != null) parts.push(`code=${entry.wsCloseCode}`);
    if (entry.endedAt && entry.startedAt) {
      parts.push(formatDuration(Math.max(0, entry.endedAt - entry.startedAt)));
    }
    return parts.join(' · ');
  }
  return 'Open';
}

function FrameRow({
  frame,
  baseAt,
  expanded,
  onToggle,
}: {
  frame: WsFrame;
  baseAt: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const relMs = Math.max(0, frame.at - baseAt);
  const fromClient = frame.dir === 'client';
  const arrow = fromClient ? '↑' : '↓';
  const dirLabel = fromClient ? 'client' : 'server';
  // Chrome-style: sent (client) red, received (server) green
  const arrowClass = fromClient ? 'text-red-500' : 'text-emerald-500';

  return (
    <View className="border-border gap-2 border-b pb-3">
      <Pressable onPress={onToggle} accessibilityRole="button">
        <View className="flex-row items-center gap-2">
          <Text className={`w-5 font-medium ${arrowClass}`}>{arrow}</Text>
          <Text className="text-xs uppercase text-muted-foreground">{dirLabel}</Text>
          <Text className="font-medium">{opcodeLabel(frame.opcode)}</Text>
          <Text variant="muted" className="ml-auto text-xs">
            +{relMs} ms · {formatBytes(frame.size)}
          </Text>
        </View>
      </Pressable>
      {expanded ? (
        <View className="pl-5">
          <BodyView body={frame.payload} />
        </View>
      ) : null}
    </View>
  );
}

function SessionLinkCallout({
  title,
  body,
  actionLabel,
  targetId,
}: {
  title: string;
  body: string;
  actionLabel: string;
  targetId: string;
}) {
  const router = useRouter();
  return (
    <View className="border-border bg-sky-500/10 gap-2 rounded-md border p-3">
      <Text className="font-medium text-sky-700 dark:text-sky-300">{title}</Text>
      <Text variant="muted">{body}</Text>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 self-start px-2"
        onPress={() => router.push(`/request/${targetId}`)}
      >
        <Text className="text-xs font-medium">{actionLabel}</Text>
      </Button>
    </View>
  );
}

function WsSessionLinks({ entry }: { entry: TrafficEntry }) {
  const { entries } = useProxyEntries();
  const newer = React.useMemo(() => findNewerWsReconnect(entry, entries), [entry, entries]);
  const previous = React.useMemo(() => findPreviousWsSession(entry, entries), [entry, entries]);
  const blocker = React.useMemo(() => findWsCaptureBlocker(entry, entries), [entry, entries]);

  if (entry.wsClosed && newer) {
    const open = !newer.wsClosed;
    return (
      <SessionLinkCallout
        title={open ? 'Newer session open' : 'Newer session captured'}
        body={
          open
            ? 'This socket closed (e.g. browser backgrounded). A reconnect for the same URL is already open as a separate capture.'
            : 'A later reconnect for the same URL was captured separately. Messages are not merged across reconnects.'
        }
        actionLabel="Open newer session"
        targetId={newer.id}
      />
    );
  }

  if (entry.wsClosed && blocker) {
    const copy = wsCaptureBlockerMessage(blocker);
    return (
      <View className="border-border bg-amber-500/10 gap-2 rounded-md border p-3">
        <Text className="font-medium text-amber-700 dark:text-amber-300">{copy.title}</Text>
        <Text variant="muted">{copy.body}</Text>
        <BlockerOpenLink targetId={blocker.entry.id} />
      </View>
    );
  }

  if (!entry.wsClosed && previous) {
    const count = previous.wsFrameCount ?? previous.wsFrames?.length ?? 0;
    return (
      <SessionLinkCallout
        title="Previous session"
        body={
          count > 0
            ? `An earlier WebSocket for this URL closed with ${count} message${count === 1 ? '' : 's'}. Reconnects stay separate captures.`
            : 'An earlier WebSocket for this URL closed. Reconnects stay separate captures.'
        }
        actionLabel="Open previous session"
        targetId={previous.id}
      />
    );
  }

  return null;
}

function BlockerOpenLink({ targetId }: { targetId: string }) {
  const router = useRouter();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 self-start px-2"
      onPress={() => router.push(`/request/${targetId}`)}
    >
      <Text className="text-xs font-medium">Open related capture</Text>
    </Button>
  );
}

export function MessagesTab({
  entry,
  onRetryLoad,
}: {
  entry: TrafficEntry;
  onRetryLoad?: () => void;
}) {
  const frames = entry.wsFrames ?? [];
  const [expandedId, setExpandedId] = React.useState<string | null>(frames[0]?.id ?? null);
  const baseAt = entry.startedAt || frames[0]?.at || 0;
  const framesMissing = wsFramesMissingFromEntry(entry);

  if (!hasWsMessages(entry)) {
    return <Text variant="muted">No WebSocket messages on this capture.</Text>;
  }

  if (frames.length === 0) {
    return (
      <View className="gap-3">
        <Text className="text-xs font-medium">{sessionStatusLine(entry)}</Text>
        {framesMissing ? (
          <View className="border-border bg-amber-500/10 gap-2 rounded-md border p-3">
            <Text className="font-medium text-amber-700 dark:text-amber-300">
              Messages not loaded
            </Text>
            <Text variant="muted">
              Summary lists {entry.wsFrameCount} message
              {(entry.wsFrameCount ?? 0) === 1 ? '' : 's'}, but the full capture could not be
              loaded.
            </Text>
            {onRetryLoad ? (
              <Button variant="outline" size="sm" className="self-start" onPress={onRetryLoad}>
                <Text className="text-sm font-medium">Retry</Text>
              </Button>
            ) : null}
          </View>
        ) : entry.wsClosed ? (
          <Text variant="muted">
            Session ended. Reconnects appear as a separate capture when MITM still reaches the
            Upgrade.
          </Text>
        ) : (
          <Text variant="muted">Waiting for WebSocket frames… Upgrade completed.</Text>
        )}
        <WsSessionLinks entry={entry} />
        <Text variant="muted" className="text-xs">
          Frames are inspected read-only (no inject or rewrite).
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <Text className="text-xs font-medium">{sessionStatusLine(entry)}</Text>
      <WsSessionLinks entry={entry} />
      <Text variant="muted" className="text-xs">
        {frames.length} message{frames.length === 1 ? '' : 's'}
        {entry.wsFramesOmitted ? ' · later frames omitted (cap)' : ''} · read-only
      </Text>
      {frames.map((frame) => (
        <FrameRow
          key={frame.id}
          frame={frame}
          baseAt={baseAt}
          expanded={expandedId === frame.id}
          onToggle={() => setExpandedId((prev) => (prev === frame.id ? null : frame.id))}
        />
      ))}
    </View>
  );
}

export function entryHasMessagesTab(entry: TrafficEntry): boolean {
  return hasWsMessages(entry);
}
