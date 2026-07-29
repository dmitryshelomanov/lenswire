/** gRPC / gRPC-Web length-prefixed framing helpers (no .proto needed). */

export type GrpcFrameKind = 'data' | 'trailer';

export type GrpcFrame = {
  kind: GrpcFrameKind;
  compressed: boolean;
  length: number;
  /** Payload bytes for this frame (may be truncated if preview was capped). */
  payload: Uint8Array;
  /** True when the frame header claimed more bytes than available in the buffer. */
  truncated: boolean;
};

export type GrpcTrailerMap = Record<string, string>;

const TRAILER_FLAG = 0x80;
const COMPRESSED_FLAG = 0x01;
const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_MAX_STRINGS = 200;

export function base64ToUint8Array(base64: string): Uint8Array {
  const normalized = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  if (typeof globalThis.atob === 'function') {
    const binary = globalThis.atob(normalized);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of normalized) {
    if (ch === '=') break;
    const val = alphabet.indexOf(ch);
    if (val < 0) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export function parseGrpcFrames(bytes: Uint8Array): GrpcFrame[] {
  const frames: GrpcFrame[] = [];
  let offset = 0;
  while (offset + 5 <= bytes.length) {
    const flags = bytes[offset]!;
    const length =
      ((bytes[offset + 1]! << 24) |
        (bytes[offset + 2]! << 16) |
        (bytes[offset + 3]! << 8) |
        bytes[offset + 4]!) >>>
      0;
    offset += 5;
    const available = Math.min(length, bytes.length - offset);
    const payload = bytes.subarray(offset, offset + available);
    offset += available;
    const kind: GrpcFrameKind = (flags & TRAILER_FLAG) !== 0 ? 'trailer' : 'data';
    frames.push({
      kind,
      compressed: (flags & COMPRESSED_FLAG) !== 0,
      length,
      payload: new Uint8Array(payload),
      truncated: available < length,
    });
    if (available < length) break;
  }
  return frames;
}

/** Parse gRPC-Web trailer payload (`key: value\r\n` lines). */
export function parseGrpcTrailers(payload: Uint8Array): GrpcTrailerMap {
  const text = utf8Decode(payload);
  const out: GrpcTrailerMap = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon <= 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

/**
 * Walk protobuf wire and collect printable UTF-8 strings from length-delimited fields.
 * Skips nested-message-looking blobs that fail UTF-8 / printable checks.
 */
export function harvestProtobufStrings(payload: Uint8Array, minLength = 3): string[] {
  return harvestProtobufStringsWithLimits(payload, {
    minLength,
    maxDepth: DEFAULT_MAX_DEPTH,
    maxStrings: DEFAULT_MAX_STRINGS,
  });
}

export function harvestProtobufStringsWithLimits(
  payload: Uint8Array,
  {
    minLength = 3,
    maxDepth = DEFAULT_MAX_DEPTH,
    maxStrings = DEFAULT_MAX_STRINGS,
  }: {
    minLength?: number;
    maxDepth?: number;
    maxStrings?: number;
  } = {},
): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  collectStrings(payload, 0);
  return found;

  function collectStrings(bytes: Uint8Array, depth: number): void {
    if (depth > maxDepth || found.length >= maxStrings) return;
    let i = 0;
    while (i < bytes.length && found.length < maxStrings) {
      const tag = readVarint(bytes, i);
      if (!tag) break;
      i = tag.next;
      const wireType = tag.value & 0x07;

      if (wireType === 0) {
        // varint
        const v = readVarint(bytes, i);
        if (!v) break;
        i = v.next;
        continue;
      }
      if (wireType === 1) {
        // 64-bit
        if (i + 8 > bytes.length) break;
        i += 8;
        continue;
      }
      if (wireType === 5) {
        // 32-bit
        if (i + 4 > bytes.length) break;
        i += 4;
        continue;
      }
      if (wireType === 2) {
        // length-delimited
        const len = readVarint(bytes, i);
        if (!len) break;
        i = len.next;
        if (len.value < 0 || i + len.value > bytes.length) break;
        const slice = bytes.subarray(i, i + len.value);
        i += len.value;
        const str = tryPrintableUtf8(slice, minLength);
        if (str && !seen.has(str)) {
          seen.add(str);
          found.push(str);
        }
        // Also harvest nested messages (common in protobuf).
        if (slice.length >= 2 && looksLikeProtobuf(slice)) {
          collectStrings(slice, depth + 1);
        }
        continue;
      }
      // Unknown / start-group / end-group — stop to avoid garbage.
      break;
    }
  }
}

function looksLikeProtobuf(bytes: Uint8Array): boolean {
  if (bytes.length < 2) return false;
  const tag = readVarint(bytes, 0);
  if (!tag) return false;
  const wireType = tag.value & 0x07;
  return wireType === 0 || wireType === 1 || wireType === 2 || wireType === 5;
}

function tryPrintableUtf8(bytes: Uint8Array, minLength: number): string | null {
  if (bytes.length < minLength) return null;
  // Reject obvious binary (high ratio of NUL / control besides tab/lf/cr).
  let control = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    const b = bytes[i]!;
    if (b === 0) return null;
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d) control += 1;
  }
  if (control / bytes.length > 0.05) return null;

  const text = utf8Decode(bytes);
  if (text.length < minLength) return null;
  // Must be mostly printable (incl. non-ASCII letters).
  let bad = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) bad += 1;
    if (code === 0xfffd) bad += 1;
  }
  if (bad > 0) return null;
  // Prefer strings with at least one letter/digit.
  if (!/[\p{L}\p{N}]/u.test(text)) return null;
  return text;
}

function readVarint(bytes: Uint8Array, offset: number): { value: number; next: number } | null {
  let value = 0;
  let shift = 0;
  let i = offset;
  while (i < bytes.length && shift < 35) {
    const b = bytes[i]!;
    i += 1;
    value |= (b & 0x7f) << shift;
    if ((b & 0x80) === 0) {
      return { value: value >>> 0, next: i };
    }
    shift += 7;
  }
  return null;
}

function utf8Decode(bytes: Uint8Array): string {
  if (typeof TextDecoder !== 'undefined') {
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  }
  // Manual UTF-8 decode fallback (no escape/decodeURIComponent).
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i]!;
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
      continue;
    }
    if ((b0 & 0xe0) === 0xc0 && i + 1 < bytes.length) {
      const b1 = bytes[i + 1]!;
      const code = ((b0 & 0x1f) << 6) | (b1 & 0x3f);
      out += String.fromCharCode(code);
      i += 2;
      continue;
    }
    if ((b0 & 0xf0) === 0xe0 && i + 2 < bytes.length) {
      const code = ((b0 & 0x0f) << 12) | ((bytes[i + 1]! & 0x3f) << 6) | (bytes[i + 2]! & 0x3f);
      out += String.fromCharCode(code);
      i += 3;
      continue;
    }
    if ((b0 & 0xf8) === 0xf0 && i + 3 < bytes.length) {
      let code =
        ((b0 & 0x07) << 18) |
        ((bytes[i + 1]! & 0x3f) << 12) |
        ((bytes[i + 2]! & 0x3f) << 6) |
        (bytes[i + 3]! & 0x3f);
      code -= 0x10000;
      out += String.fromCharCode(0xd800 + (code >> 10), 0xdc00 + (code & 0x3ff));
      i += 4;
      continue;
    }
    out += '\uFFFD';
    i += 1;
  }
  return out;
}
