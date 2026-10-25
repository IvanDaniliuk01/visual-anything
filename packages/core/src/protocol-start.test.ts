/**
 * The live protocol while the local program runs on a folder that holds no project yet (ADR 0051):
 * the samples a new project can start from, and the app's choice.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_START_NAME,
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  type AppMessage,
  type ServerMessage,
} from './protocol';

const offered: ServerMessage = {
  type: 'start/offered',
  protocolVersion: PROTOCOL_VERSION,
  folder: 'new-project',
  samples: [{ id: 'c4-architecture', name: 'Internet banking', packages: ['c4'] }],
  token: 'secret',
};

describe('start/offered', () => {
  it('round-trips', () => {
    expect(decodeServerMessage(encodeMessage(offered))).toEqual(offered);
  });

  it('is refused from another version, without its samples, or with a token that is no text', () => {
    for (const bad of [
      { ...offered, protocolVersion: 4 },
      { ...offered, samples: 'c4' },
      { ...offered, samples: [{ id: 5 }] },
      { ...offered, folder: 3 },
      { ...offered, token: 7 },
    ]) {
      expect(() => decodeServerMessage(JSON.stringify(bad)), JSON.stringify(bad)).toThrow(
        ProtocolError,
      );
    }
  });
});

describe('start/create', () => {
  it('round-trips, from a sample or empty, with the names the app gives', () => {
    const messages: AppMessage[] = [
      { type: 'start/create', requestId: 'r1', sample: 'c4-architecture' },
      { type: 'start/create', requestId: 'r2', names: { project: 'Mine', view: 'Vista general' } },
      { type: 'start/create', requestId: 'r3' },
    ];
    for (const message of messages) {
      expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
    }
  });

  it('refuses a sample that is no id, and names that are no short text', () => {
    for (const bad of [
      { type: 'start/create', requestId: 'r', sample: 5 },
      { type: 'start/create', requestId: 'r', sample: '../../etc' },
      { type: 'start/create', requestId: 'r', names: 'Mine' },
      { type: 'start/create', requestId: 'r', names: { project: 5 } },
      { type: 'start/create', requestId: 'r', names: { view: 'x'.repeat(MAX_START_NAME + 1) } },
      { type: 'start/create', requestId: 'r', names: { other: 'x' } },
    ]) {
      expect(() => decodeAppMessage(JSON.stringify(bad)), JSON.stringify(bad)).toThrow(
        ProtocolError,
      );
    }
  });
});
