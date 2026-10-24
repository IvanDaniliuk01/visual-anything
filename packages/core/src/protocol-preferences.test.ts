/** The preference messages of the live protocol (ADR-0032). */
import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFERENCES } from './preferences';
import {
  ProtocolError,
  THEME_PARAM,
  TOKEN_PARAM,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
  type ServerMessage,
} from './protocol';

describe('THEME_PARAM', () => {
  it('travels in the fragment beside the token, under its own name', () => {
    expect(THEME_PARAM).toBe('theme');
    expect(THEME_PARAM).not.toBe(TOKEN_PARAM);
  });
});

describe('preferences/changed', () => {
  it.each<ServerMessage>([
    { type: 'preferences/changed', preferences: { ...DEFAULT_PREFERENCES, theme: 'dark' } },
    {
      type: 'preferences/changed',
      preferences: { ...DEFAULT_PREFERENCES, recentColors: ['#1D4F91'] },
      requestId: 'request-3',
    },
  ])('reads back what the local program sends', (message) => {
    expect(decodeServerMessage(encodeMessage(message))).toEqual(message);
  });

  it.each([
    ['no preferences', { type: 'preferences/changed' }],
    ['preferences that are not an object', { type: 'preferences/changed', preferences: 'dark' }],
    ['a list for preferences', { type: 'preferences/changed', preferences: ['dark'] }],
  ])('refuses a message with %s', (_, message) => {
    expect(() => decodeServerMessage(JSON.stringify(message))).toThrow(ProtocolError);
  });
});

describe('preferences/set', () => {
  it('reads back what an app sends', () => {
    const message: AppMessage = {
      type: 'preferences/set',
      requestId: 'request-1',
      changes: { theme: 'light' },
    };
    expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
  });

  it('leaves the changes themselves to checkPreferenceChanges', () => {
    const text = JSON.stringify({ type: 'preferences/set', requestId: 'r', changes: { theme: 1 } });
    expect(decodeAppMessage(text)).toMatchObject({ changes: { theme: 1 } });
  });

  it.each([
    ['no changes', { type: 'preferences/set', requestId: 'r' }],
    [
      'changes that are not an object',
      { type: 'preferences/set', requestId: 'r', changes: 'dark' },
    ],
    ['a list of changes', { type: 'preferences/set', requestId: 'r', changes: ['theme'] }],
    ['no request id', { type: 'preferences/set', changes: { theme: 'dark' } }],
  ])('refuses a message with %s', (_, message) => {
    expect(() => decodeAppMessage(JSON.stringify(message))).toThrow(ProtocolError);
  });

  it('still refuses message types the protocol does not define', () => {
    const text = JSON.stringify({ type: 'preferences/get', requestId: 'r' });
    expect(() => decodeAppMessage(text)).toThrow('Unknown message type: "preferences/get".');
  });
});
