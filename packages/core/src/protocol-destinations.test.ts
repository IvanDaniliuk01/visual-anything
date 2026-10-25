/**
 * The live protocol's messages for following a destination to another project (version 6, ADR 0056):
 * the app asks its program to open that project, and the program answers once a tab opened there.
 */
import { describe, expect, it } from 'vitest';
import {
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
  type ServerMessage,
} from './protocol';

describe('opening another project', () => {
  it.each<AppMessage>([
    { type: 'project/open-other', requestId: 'r1', project: '../billing' },
    { type: 'project/open-other', requestId: 'r2', project: '../billing', view: 'invoices' },
  ])('reads back the request $project', (message) => {
    expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
  });

  it('keeps only what the request holds', () => {
    const read = decodeAppMessage(
      JSON.stringify({ type: 'project/open-other', requestId: 'r', project: 'a', extra: 1 }),
    );
    expect(read).toEqual({ type: 'project/open-other', requestId: 'r', project: 'a' });
  });

  it.each([
    ['no project', { type: 'project/open-other', requestId: 'r' }],
    ['a project that is not text', { type: 'project/open-other', requestId: 'r', project: 7 }],
    ['an empty project', { type: 'project/open-other', requestId: 'r', project: '' }],
    [
      'a project path too long',
      { type: 'project/open-other', requestId: 'r', project: 'a/'.repeat(600) },
    ],
    [
      'a view that is no id',
      { type: 'project/open-other', requestId: 'r', project: '../a', view: 'no id' },
    ],
  ])('refuses a request with %s', (_, message) => {
    expect(() => decodeAppMessage(JSON.stringify(message))).toThrow(ProtocolError);
  });

  it('reads back the answer that the other project opened', () => {
    const answer: ServerMessage = {
      type: 'other-project/opened',
      requestId: 'r1',
      name: 'Billing',
    };
    expect(decodeServerMessage(encodeMessage(answer))).toEqual(answer);
    expect(() =>
      decodeServerMessage(JSON.stringify({ type: 'other-project/opened', requestId: 'r' })),
    ).toThrow(ProtocolError);
  });
});
