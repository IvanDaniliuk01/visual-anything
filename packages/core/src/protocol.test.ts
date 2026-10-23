import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  ProtocolError,
  decodeServerMessage,
  encodeServerMessage,
  type ServerMessage,
} from './protocol';
import type { ProjectSnapshot } from './snapshot';

const project: ProjectSnapshot = {
  project: { schemaVersion: 1, name: 'My systems', packages: [] },
  model: {
    world: { id: 'world', component: 'essence', name: 'My systems' },
    elements: [],
    relations: [],
  },
  packages: [],
  views: [],
  scenarios: [],
};

describe('decodeServerMessage', () => {
  it('reads back a message written by encodeServerMessage', () => {
    const message: ServerMessage = {
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project,
    };
    expect(decodeServerMessage(encodeServerMessage(message))).toEqual(message);
  });

  it.each([
    ['text that is not JSON', 'project/opened'],
    ['a value that is not an object', '["project/opened"]'],
    ['an unknown message type', JSON.stringify({ type: 'model/exploded' })],
    [
      'another protocol version',
      JSON.stringify({ type: 'project/opened', protocolVersion: PROTOCOL_VERSION + 1, project }),
    ],
    [
      'a message without its project',
      JSON.stringify({ type: 'project/opened', protocolVersion: PROTOCOL_VERSION }),
    ],
  ])('rejects %s', (_case, text) => {
    expect(() => decodeServerMessage(text)).toThrow(ProtocolError);
  });
});
