/** What the Claude endpoint reads of live values (ADR 0057): strictly, and nothing else. */
import { ProtocolError } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { decodeClaudeMessage, decodeProgramMessage } from './messages';

describe('live values on the Claude endpoint', () => {
  it('takes live values from Claude or the command line', () => {
    expect(
      decodeClaudeMessage(
        JSON.stringify({ type: 'live/set', requestId: 'r', values: [{}], freshFor: 5_000 }),
      ),
    ).toEqual({ type: 'live/set', requestId: 'r', values: [{}], freshFor: 5_000, from: 'claude' });
    expect(
      decodeClaudeMessage(
        JSON.stringify({ type: 'live/set', requestId: 'r', values: [], from: 'command-line' }),
      ),
    ).toEqual({ type: 'live/set', requestId: 'r', values: [], from: 'command-line' });
  });

  it('refuses another sender, a freshness that cannot be, or values not in a list', () => {
    for (const message of [
      { type: 'live/set', requestId: 'r', values: [], from: { kind: 'package', package: 'p' } },
      { type: 'live/set', requestId: 'r', values: [], from: 'everyone' },
      { type: 'live/set', requestId: 'r', values: [], freshFor: 10 },
      { type: 'live/set', requestId: 'r', values: {} },
    ]) {
      expect(() => decodeClaudeMessage(JSON.stringify(message))).toThrow(ProtocolError);
    }
  });

  it('clears by targets and attributes, from one sender or everyone', () => {
    expect(
      decodeClaudeMessage(
        JSON.stringify({ type: 'live/clear', requestId: 'r', targets: ['api'], from: 'everyone' }),
      ),
    ).toEqual({ type: 'live/clear', requestId: 'r', targets: ['api'], from: 'everyone' });
    for (const message of [
      { type: 'live/clear', requestId: 'r', targets: ['not an id'] },
      { type: 'live/clear', requestId: 'r', attributes: [''] },
      { type: 'live/clear', requestId: 'r', targets: Array.from({ length: 1001 }, () => 'a') },
    ]) {
      expect(() => decodeClaudeMessage(JSON.stringify(message))).toThrow(ProtocolError);
    }
  });

  it('reads how many were cleared', () => {
    expect(
      decodeProgramMessage(JSON.stringify({ type: 'live/cleared', requestId: 'r', cleared: 2 })),
    ).toEqual({ type: 'live/cleared', requestId: 'r', cleared: 2 });
    expect(() =>
      decodeProgramMessage(JSON.stringify({ type: 'live/cleared', requestId: 'r', cleared: -1 })),
    ).toThrow(ProtocolError);
  });

  it('asks for live values by targets and attributes, at most a thousand', () => {
    expect(
      decodeClaudeMessage(
        JSON.stringify({
          type: 'live/list',
          requestId: 'r',
          targets: ['api'],
          limit: 5,
          from: 'x',
        }),
      ),
    ).toEqual({ type: 'live/list', requestId: 'r', targets: ['api'], limit: 5 });
    expect(decodeClaudeMessage(JSON.stringify({ type: 'live/list', requestId: 'r' }))).toEqual({
      type: 'live/list',
      requestId: 'r',
    });
    for (const message of [
      { type: 'live/list', requestId: 'r', targets: ['not an id'] },
      { type: 'live/list', requestId: 'r', attributes: [''] },
      { type: 'live/list', requestId: 'r', limit: 0 },
      { type: 'live/list', requestId: 'r', limit: 1001 },
      { type: 'live/list', requestId: 'r', limit: 2.5 },
    ]) {
      expect(() => decodeClaudeMessage(JSON.stringify(message))).toThrow(ProtocolError);
    }
  });

  it('reads the live values listed strictly, each rebuilt from its parts', () => {
    const value = {
      target: 'api',
      attribute: 'latency',
      value: 120,
      sender: { kind: 'claude' },
      arrivedAt: 1000,
      freshFor: 60_000,
    };
    const summary = {
      targets: 1,
      stale: 0,
      attributes: [{ attribute: 'latency', values: 2, stale: 0 }],
    };
    expect(
      decodeProgramMessage(
        JSON.stringify({
          type: 'live/listed',
          requestId: 'r',
          values: [{ ...value, extra: true }],
          total: 2,
          at: 2000,
          summary,
        }),
      ),
    ).toEqual({
      type: 'live/listed',
      requestId: 'r',
      values: [value],
      total: 2,
      at: 2000,
      summary,
    });
    for (const message of [
      { type: 'live/listed', requestId: 'r', values: [value], total: -1, at: 0 },
      {
        type: 'live/listed',
        requestId: 'r',
        values: [{ ...value, sender: 'me' }],
        total: 1,
        at: 0,
      },
      { type: 'live/listed', requestId: 'r', values: {}, total: 0, at: 0 },
      { type: 'live/listed', requestId: 'r', values: [], total: 0, at: 0, summary: { targets: 1 } },
    ]) {
      expect(() => decodeProgramMessage(JSON.stringify(message))).toThrow(ProtocolError);
    }
  });

  it('reads what it is given or refuses it with the protocol’s own error', () => {
    const hostile: unknown[] = [
      null,
      1,
      'text',
      [],
      {},
      { __proto__: { from: 'claude' } },
      JSON.parse('{"__proto__": {"polluted": true}}'),
      Array.from({ length: 5000 }, () => ({})),
      { toString: 'claude' },
      `claude${String.fromCharCode(0)}`,
    ];
    for (const values of hostile) {
      for (const from of hostile) {
        for (const message of [
          { type: 'live/set', requestId: 'r', values, from },
          { type: 'live/clear', requestId: 'r', targets: values, attributes: from, from },
          { type: 'live/list', requestId: 'r', targets: values, attributes: from, limit: from },
        ]) {
          try {
            decodeClaudeMessage(JSON.stringify(message));
          } catch (error) {
            expect(error).toBeInstanceOf(ProtocolError);
          }
        }
      }
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
