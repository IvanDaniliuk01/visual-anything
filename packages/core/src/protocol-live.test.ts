import { describe, expect, it } from 'vitest';
import type { LiveValue } from './live';
import { ProtocolError, decodeAppMessage, decodeServerMessage, encodeMessage } from './protocol';

const VALUE: LiveValue = {
  target: 'api',
  attribute: 'latency',
  value: 120,
  sender: { kind: 'package', package: 'gauges' },
  arrivedAt: 1_000,
  measuredAt: 900,
  freshFor: 60_000,
};

describe('live values in the live protocol (version 6)', () => {
  it('carries the live values the program keeps, and those removed', () => {
    const message = {
      type: 'live/values' as const,
      values: [VALUE],
      removed: [{ target: 'db', attribute: 'load' }],
    };
    expect(decodeServerMessage(encodeMessage(message))).toEqual(message);
  });

  it('answers what a sender sent, and what was fetched', () => {
    const kept = {
      type: 'live/kept' as const,
      requestId: 'r1',
      kept: 1,
      waiting: 0,
      dropped: 0,
      unknown: [],
      refused: [],
    };
    expect(decodeServerMessage(encodeMessage(kept))).toEqual(kept);
    const fetched = { type: 'live/fetched' as const, requestId: 'r2', status: 200, text: '[]' };
    expect(decodeServerMessage(encodeMessage(fetched))).toEqual(fetched);
  });

  it('refuses live values it cannot read, as the protocol’s own error', () => {
    for (const text of [
      JSON.stringify({
        type: 'live/values',
        values: [{ ...VALUE, sender: undefined }],
        removed: [],
      }),
      JSON.stringify({ type: 'live/values', values: 'all' }),
      JSON.stringify({ type: 'live/kept', kept: 1 }),
      JSON.stringify({ type: 'live/fetched', requestId: 'r', status: 200 }),
    ]) {
      expect(() => decodeServerMessage(text)).toThrow(ProtocolError);
    }
  });

  it('takes from an app what to fetch for package code, and the live values it made', () => {
    expect(
      decodeAppMessage(
        JSON.stringify({
          type: 'live/fetch',
          requestId: 'r',
          package: 'gauges',
          url: 'https://a.example/x',
        }),
      ),
    ).toEqual({
      type: 'live/fetch',
      requestId: 'r',
      package: 'gauges',
      url: 'https://a.example/x',
    });
    expect(
      decodeAppMessage(
        JSON.stringify({
          type: 'live/set',
          requestId: 'r',
          package: 'gauges',
          values: [1],
          extra: 2,
        }),
      ),
    ).toEqual({ type: 'live/set', requestId: 'r', package: 'gauges', values: [1] });
    expect(() =>
      decodeAppMessage(
        JSON.stringify({ type: 'live/set', requestId: 'r', package: 'not an id', values: [] }),
      ),
    ).toThrow(ProtocolError);
    expect(() =>
      decodeAppMessage(JSON.stringify({ type: 'live/fetch', requestId: 'r', package: 'gauges' })),
    ).toThrow(ProtocolError);
  });
});
