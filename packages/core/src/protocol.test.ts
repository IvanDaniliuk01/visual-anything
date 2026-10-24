import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  ProtocolError,
  decodeAppMessage,
  decodeServerMessage,
  encodeMessage,
  encodeServerMessage,
  type AppMessage,
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

describe('PROTOCOL_VERSION', () => {
  it('is 2, since operations can change stacking orders', () => {
    expect(PROTOCOL_VERSION).toBe(2);
  });
});

describe('decodeServerMessage', () => {
  it.each<ServerMessage>([
    { type: 'project/opened', protocolVersion: PROTOCOL_VERSION, project, history: {} },
    {
      type: 'project/changed',
      operations: [{ op: 'set-project', project: project.project }],
      kind: 'do',
      label: 'Edit the project',
      author: 'claude',
      history: { undo: { label: 'Edit the project', author: 'claude' } },
      requestId: 'r1',
      warnings: [],
      created: [],
    },
    {
      type: 'command/rejected',
      requestId: 'r1',
      problems: [{ code: 'empty-name', message: 'A view needs a name.' }],
    },
    { type: 'project/reloaded', project, history: {}, reason: 'model.vamodel changed on disk.' },
    { type: 'notice', level: 'warning', message: 'model.vamodel is not valid.' },
  ])('reads back a $type message', (message) => {
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
      'an opening without its project',
      JSON.stringify({ type: 'project/opened', protocolVersion: PROTOCOL_VERSION }),
    ],
    ['a change without operations', JSON.stringify({ type: 'project/changed' })],
  ])('rejects %s', (_case, text) => {
    expect(() => decodeServerMessage(text)).toThrow(ProtocolError);
  });
});

describe('decodeAppMessage', () => {
  it.each<AppMessage>([
    { type: 'command', requestId: 'r1', command: { type: 'delete', elements: ['api'] } },
    { type: 'undo', requestId: 'r2' },
    { type: 'redo', requestId: 'r3' },
  ])('reads back a $type message', (message) => {
    expect(decodeAppMessage(encodeMessage(message))).toEqual(message);
  });

  it.each([
    ['a message without a request id', JSON.stringify({ type: 'undo' })],
    ['a request id that is too long', JSON.stringify({ type: 'undo', requestId: 'r'.repeat(101) })],
    [
      'a command that is not an object',
      JSON.stringify({ type: 'command', requestId: 'r', command: 'delete' }),
    ],
    ['an unknown message type', JSON.stringify({ type: 'explode', requestId: 'r' })],
    ['text that is not JSON', '{'],
  ])('rejects %s', (_case, text) => {
    expect(() => decodeAppMessage(text)).toThrow(ProtocolError);
  });
});
