import {
  entryUrl,
  formatBytes,
  type TrafficBody,
  type TrafficEntry,
} from '@/entities/traffic/types';

import { diffHeaders, diffTextLines } from './request-diff';

function labelLine(side: 'A' | 'B', entry: TrafficEntry): string {
  return `${entry.method} ${entryUrl(entry)} (${entry.id}) status=${entry.status}`;
}

function pushChangedLine(lines: string[], label: string, left: string, right: string): void {
  if (left === right) {
    lines.push(` ${label}: ${left}`);
    return;
  }
  lines.push(`-${label}: ${left}`);
  lines.push(`+${label}: ${right}`);
}

function formatHeaderSection(
  title: string,
  left: Record<string, string>,
  right: Record<string, string>,
): string[] {
  const changed = diffHeaders(left, right).filter((row) => row.side !== 'same');
  if (changed.length === 0) return [];

  const out = [`@@ ${title} @@`];
  for (const row of changed) {
    if (row.side === 'left') {
      out.push(`-${row.key}: ${row.left ?? ''}`);
    } else if (row.side === 'right') {
      out.push(`+${row.key}: ${row.right ?? ''}`);
    } else {
      out.push(`-${row.key}: ${row.left ?? ''}`);
      out.push(`+${row.key}: ${row.right ?? ''}`);
    }
  }
  return out;
}

function isTextBody(body: TrafficBody): boolean {
  return body.kind === 'text' || body.kind === 'json';
}

function formatBodySection(title: string, left: TrafficBody, right: TrafficBody): string[] {
  const leftText = isTextBody(left) ? (left.text ?? '') : null;
  const rightText = isTextBody(right) ? (right.text ?? '') : null;

  if (leftText == null || rightText == null) {
    const a = `${left.kind} ${formatBytes(left.size)}`;
    const b = `${right.kind} ${formatBytes(right.size)}`;
    if (a === b && left.kind === right.kind) return [];
    return [`@@ ${title} @@`, `-A: ${a}`, `+B: ${b}`];
  }

  if (leftText === rightText) return [];

  const rows = diffTextLines(leftText, rightText);
  const out = [`@@ ${title} @@`];
  for (const row of rows) {
    if (row.side === 'same') {
      out.push(` ${row.left ?? ''}`);
    } else if (row.side === 'left') {
      out.push(`-${row.left ?? ''}`);
    } else if (row.side === 'right') {
      out.push(`+${row.right ?? ''}`);
    } else {
      if (row.left != null) out.push(`-${row.left}`);
      if (row.right != null) out.push(`+${row.right}`);
    }
  }
  return out;
}

/** Build a unified-diff style text for sharing two captures. */
export function toCompareDiff(left: TrafficEntry, right: TrafficEntry): string {
  const lines: string[] = [
    `--- A ${labelLine('A', left)}`,
    `+++ B ${labelLine('B', right)}`,
    '@@ overview @@',
  ];

  pushChangedLine(lines, 'method', left.method, right.method);
  pushChangedLine(lines, 'status', String(left.status), String(right.status));
  pushChangedLine(lines, 'url', entryUrl(left), entryUrl(right));

  lines.push(...formatHeaderSection('request headers', left.requestHeaders, right.requestHeaders));
  lines.push(
    ...formatHeaderSection('response headers', left.responseHeaders, right.responseHeaders),
  );
  lines.push(...formatBodySection('request body', left.requestBody, right.requestBody));
  lines.push(...formatBodySection('response body', left.responseBody, right.responseBody));

  return `${lines.join('\n')}\n`;
}
