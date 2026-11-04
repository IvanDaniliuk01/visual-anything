import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  ProtocolError,
  SESSION_CHALLENGE_FORM,
  decodeServerMessage,
  encodeServerMessage,
} from './protocol';

describe('app/shown (ADR 0099)', () => {
  it('came with protocol version 10', () => {
    expect(PROTOCOL_VERSION).toBeGreaterThanOrEqual(10);
  });

  it('reads back what it writes, with a view state or without', () => {
    expect(decodeServerMessage(encodeServerMessage({ type: 'app/shown' }))).toEqual({
      type: 'app/shown',
    });
    const shown = {
      type: 'app/shown' as const,
      state: { view: 'system-overview', select: ['appointments-api'] },
    };
    expect(decodeServerMessage(encodeServerMessage(shown))).toEqual(shown);
  });

  it('refuses a view state that is not an object; the app checks the rest', () => {
    expect(() =>
      decodeServerMessage(JSON.stringify({ type: 'app/shown', state: 'overview' })),
    ).toThrow(ProtocolError);
  });
});

describe('the session proof’s challenge', () => {
  it('is 16 to 64 bytes in lower-case hex', () => {
    expect(SESSION_CHALLENGE_FORM.test('ab'.repeat(16))).toBe(true);
    expect(SESSION_CHALLENGE_FORM.test('ab'.repeat(64))).toBe(true);
    expect(SESSION_CHALLENGE_FORM.test('ab'.repeat(15))).toBe(false);
    expect(SESSION_CHALLENGE_FORM.test('AB'.repeat(16))).toBe(false);
    expect(SESSION_CHALLENGE_FORM.test('ab'.repeat(65))).toBe(false);
  });
});
