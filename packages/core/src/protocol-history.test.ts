import { describe, expect, it } from 'vitest';
import {
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  encodeServerMessage,
  readListedActions,
  type AppMessage,
  type HistoryListedMessage,
  type ListedAction,
} from './protocol';

const RENAME: ListedAction = {
  id: 1,
  label: 'Rename "API" to "Gateway"',
  author: 'user',
  time: Date.UTC(2026, 9, 24, 14, 32),
  undone: false,
};
const CREATE: ListedAction = {
  id: 2,
  label: 'Create "Booking agent"',
  author: 'claude',
  time: Date.UTC(2026, 9, 24, 14, 33),
  undone: true,
};

describe('the history list (protocol 5)', () => {
  it.each<HistoryListedMessage>([
    { type: 'history/listed', actions: [] },
    { type: 'history/listed', actions: [RENAME, CREATE] },
  ])('reads back a list of $actions.length actions', (message) => {
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual(message);
  });

  it('keeps only what each action holds', () => {
    expect(readListedActions([{ ...RENAME, operations: ['too much'] }])).toEqual([RENAME]);
  });

  it.each<[string, unknown]>([
    ['a list that is not a list', { first: RENAME }],
    ['an action that is not an object', ['Rename']],
    ['an id that is not a whole number', [{ ...RENAME, id: 1.5 }]],
    ['an id below one', [{ ...RENAME, id: 0 }]],
    ['a label that is not text', [{ ...RENAME, label: 7 }]],
    ['an author that is neither the person nor Claude', [{ ...RENAME, author: 'git' }]],
    ['a time that is not a number', [{ ...RENAME, time: '14:32' }]],
    ['an undone mark that is not a boolean', [{ ...RENAME, undone: 'no' }]],
    ['the same id twice', [RENAME, { ...CREATE, id: RENAME.id }]],
  ])('refuses %s', (_case, actions) => {
    expect(() => readListedActions(actions)).toThrow(ProtocolError);
    expect(() => decodeServerMessage(JSON.stringify({ type: 'history/listed', actions }))).toThrow(
      ProtocolError,
    );
  });

  it('refuses a list message without its actions', () => {
    expect(() => decodeServerMessage(JSON.stringify({ type: 'history/listed' }))).toThrow(
      ProtocolError,
    );
  });
});

describe('undo and redo up to an action (protocol 5)', () => {
  it.each<AppMessage>([
    { type: 'undo', requestId: 'u1', to: 4 },
    { type: 'redo', requestId: 'r1', to: 9 },
  ])('reads back a $type up to action $to', (message) => {
    expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
  });

  it.each([
    ['an action that is not a whole number', { type: 'undo', requestId: 'u', to: 2.5 }],
    ['an action below one', { type: 'redo', requestId: 'r', to: 0 }],
    ['an action named by text', { type: 'undo', requestId: 'u', to: '4' }],
  ])('refuses %s', (_case, message) => {
    expect(() => decodeAppMessage(JSON.stringify(message))).toThrow(ProtocolError);
  });
});
