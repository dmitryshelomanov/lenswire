import { describe, expect, it } from 'vitest';

import { harvestProtobufStringsWithLimits, parseGrpcFrames, parseGrpcTrailers } from './grpc-body';

function encodeVarint(value: number): number[] {
  const out: number[] = [];
  let next = value >>> 0;
  while (next >= 0x80) {
    out.push((next & 0x7f) | 0x80);
    next >>>= 7;
  }
  out.push(next);
  return out;
}

function encodeStringField(fieldNumber: number, text: string): Uint8Array {
  const encoder = new TextEncoder();
  const payload = encoder.encode(text);
  const tag = (fieldNumber << 3) | 2;
  return Uint8Array.from([tag, ...encodeVarint(payload.length), ...payload]);
}

function wrapNestedField(fieldNumber: number, nested: Uint8Array): Uint8Array {
  const tag = (fieldNumber << 3) | 2;
  return Uint8Array.from([tag, ...encodeVarint(nested.length), ...nested]);
}

describe('parseGrpcFrames', () => {
  it('parses data and trailer frames', () => {
    const dataPayload = Uint8Array.from([0x0a, 0x03, 0x66, 0x6f, 0x6f]); // protobuf: field1="foo"
    const trailerPayload = new TextEncoder().encode('grpc-status: 0\r\n');
    const bytes = Uint8Array.from([
      0x00,
      0x00,
      0x00,
      0x00,
      dataPayload.length,
      ...dataPayload,
      0x80,
      0x00,
      0x00,
      0x00,
      trailerPayload.length,
      ...trailerPayload,
    ]);

    const frames = parseGrpcFrames(bytes);
    expect(frames).toHaveLength(2);
    expect(frames[0]?.kind).toBe('data');
    expect(frames[0]?.length).toBe(dataPayload.length);
    expect(frames[1]?.kind).toBe('trailer');
    expect(parseGrpcTrailers(frames[1]!.payload)).toEqual({ 'grpc-status': '0' });
  });
});

describe('harvestProtobufStringsWithLimits', () => {
  it('collects nested strings when within recursion limit', () => {
    const deep = encodeStringField(1, 'deep-value');
    const level2 = wrapNestedField(1, deep);
    const root = wrapNestedField(1, level2);
    const strings = harvestProtobufStringsWithLimits(root, { maxDepth: 3 });
    expect(strings).toContain('deep-value');
  });

  it('stops traversal at configured maxDepth', () => {
    const deep = encodeStringField(1, 'deep-value');
    const level2 = wrapNestedField(1, deep);
    const root = wrapNestedField(1, level2);
    const strings = harvestProtobufStringsWithLimits(root, { maxDepth: 1 });
    expect(strings).not.toContain('deep-value');
  });
});
