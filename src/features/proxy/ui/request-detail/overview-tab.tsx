import { View } from 'react-native';

import {
  clientAttributionKindOfEntry,
  clientAttributionLabelOfEntry,
  clientNameOfEntry,
} from '@/entities/traffic/client-name';
import { grpcBadgeLabel, grpcVariant, parseGrpcPath } from '@/entities/traffic/grpc';
import {
  captureModeLabel,
  entryUrl,
  formatBytes,
  formatDuration,
  type TrafficEntry,
} from '@/entities/traffic/types';
import { Text } from '@/shared/ui/text';

import {
  connectionRoute,
  decryptHelpHint,
  decryptHelpTitle,
  httpPayloadLabel,
  requestPath,
} from '../../lib/entry-display';
import { MetaRow } from './meta-row';
import { OverviewOverrideActions } from './override-actions';

export function OverviewTab({ entry }: { entry: TrafficEntry }) {
  const decryptHint = decryptHelpHint(entry);
  const decryptTitle = decryptHelpTitle(entry);
  const variant = grpcVariant(entry);
  const grpcPath = variant ? parseGrpcPath(entry.path) : null;
  const clientKind = clientAttributionKindOfEntry(entry);
  const clientLabel = clientNameOfEntry(entry);

  return (
    <View className="gap-4">
      <OverviewOverrideActions entry={entry} />
      <MetaRow label="URL" value={entryUrl(entry)} mono />
      <MetaRow label="Initiator" value={clientLabel} />
      <MetaRow label="Attribution" value={clientAttributionLabelOfEntry(entry)} />
      {entry.clientPackage ? <MetaRow label="Package" value={entry.clientPackage} mono /> : null}
      {entry.clientUid != null ? <MetaRow label="UID" value={String(entry.clientUid)} /> : null}
      <MetaRow label="Request path" value={requestPath(entry)} mono />
      {grpcPath ? <MetaRow label="gRPC" value={grpcPath.shortLabel} mono /> : null}
      {variant ? <MetaRow label="RPC transport" value={grpcBadgeLabel(variant)} /> : null}
      {grpcPath?.packageName ? (
        <MetaRow label="gRPC package" value={grpcPath.packageName} mono />
      ) : null}
      <MetaRow label="Connection route" value={connectionRoute(entry)} mono />
      {entry.rawTarget ? <MetaRow label="Raw target" value={entry.rawTarget} mono /> : null}
      {entry.connectTarget ? (
        <MetaRow label="CONNECT target" value={entry.connectTarget} mono />
      ) : null}
      {entry.connectPort != null ? (
        <MetaRow label="Target port" value={String(entry.connectPort)} />
      ) : null}
      {entry.effectiveHost ? (
        <MetaRow label="Effective host" value={entry.effectiveHost} mono />
      ) : null}
      <MetaRow label="Capture mode" value={captureModeLabel(entry.captureMode)} />
      {entry.overrideApplied ? (
        <MetaRow
          label="Override"
          value={entry.overrideApplied === 'response' ? 'Response mock' : 'Request rewrite'}
        />
      ) : null}
      <MetaRow label="HTTP payload" value={httpPayloadLabel(entry)} />
      {entry.captureSummary ? (
        <MetaRow label="Capture summary" value={entry.captureSummary} />
      ) : null}
      {decryptHint && decryptTitle ? (
        <View className="border-border bg-amber-500/10 gap-1 rounded-md border p-3">
          <Text className="font-medium text-amber-700 dark:text-amber-300">{decryptTitle}</Text>
          <Text variant="muted">{decryptHint}</Text>
        </View>
      ) : null}
      <MetaRow label="Method" value={entry.method} />
      <MetaRow label="Status" value={String(entry.status)} />
      <MetaRow label="Duration" value={formatDuration(entry.timing.totalMs)} />
      <MetaRow label="Request size" value={formatBytes(entry.requestBody.size)} />
      <MetaRow label="Response size" value={formatBytes(entry.responseBody.size)} />
      <MetaRow label="Started" value={new Date(entry.startedAt).toLocaleString()} />
      {entry.reasonCode ? <MetaRow label="Decrypt" value={entry.reasonCode} mono /> : null}
      {entry.hostnameSource ? (
        <MetaRow label="Hostname source" value={entry.hostnameSource} mono />
      ) : null}
      {entry.hostnameConfidence ? (
        <MetaRow label="Hostname confidence" value={entry.hostnameConfidence} />
      ) : null}
      {entry.sniHostname ? <MetaRow label="SNI" value={entry.sniHostname} mono /> : null}
      {entry.tlsRecordVersion ? (
        <MetaRow label="TLS record" value={entry.tlsRecordVersion} mono />
      ) : null}
      {entry.tlsClientVersion ? (
        <MetaRow label="TLS client hello" value={entry.tlsClientVersion} mono />
      ) : null}
      {entry.tlsAlpnProtocols && entry.tlsAlpnProtocols.length > 0 ? (
        <MetaRow label="Client ALPN" value={entry.tlsAlpnProtocols.join(', ')} mono />
      ) : null}
      {entry.tlsNegotiatedAlpn ? (
        <MetaRow label="Negotiated (client)" value={entry.tlsNegotiatedAlpn} mono />
      ) : null}
      {entry.upstreamHttpVersion ? (
        <MetaRow label="Upstream" value={entry.upstreamHttpVersion} mono />
      ) : null}
      {entry.bypassCause ? <MetaRow label="Bypass cause" value={entry.bypassCause} mono /> : null}
      {entry.tlsClientHelloBytes != null ? (
        <MetaRow label="ClientHello size" value={`${entry.tlsClientHelloBytes} B`} />
      ) : null}
      {entry.tlsSniPresent != null ? (
        <MetaRow label="SNI extension" value={entry.tlsSniPresent ? 'present' : 'absent'} />
      ) : null}
      {clientKind === 'heuristic' ? (
        <View className="border-border bg-sky-500/10 gap-1 rounded-md border p-3">
          <Text className="font-medium text-sky-700 dark:text-sky-300">Heuristic attribution</Text>
          <Text variant="muted">
            This label is inferred from request headers such as `User-Agent`, not from the exact
            source app identity.
          </Text>
        </View>
      ) : null}
    </View>
  );
}
