/** The live connection while the local program runs on a folder that holds no project yet (ADR 0051). */
import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { LiveConnection } from './connection';

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

const offered = encodeServerMessage({
  type: 'start/offered',
  protocolVersion: PROTOCOL_VERSION,
  folder: 'new-project',
  samples: [{ id: 'c4-architecture', name: 'Internet banking', packages: ['c4'] }],
  token: 'handed-over',
});

function offering() {
  const handed: string[] = [];
  const connection = new LiveConnection('ws://localhost:3000/live?launch=code', {
    onToken: (token) => {
      handed.push(token);
      return `ws://localhost:3000/live?token=${token}`;
    },
  });
  connection.connect();
  const socket = FakeWebSocket.created[0] as FakeWebSocket;
  socket.accept();
  socket.receive(offered);
  return { connection, socket, handed };
}

describe('LiveConnection on a folder that holds no project yet', () => {
  it('keeps the offer, open but with no project, and the token handed over for the launch code', () => {
    const { connection, handed } = offering();
    expect(connection.getState()).toMatchObject({
      status: 'open',
      project: undefined,
      start: { folder: 'new-project', samples: [{ id: 'c4-architecture' }] },
    });
    expect(handed).toEqual(['handed-over']);
    expect(connection.sessionToken()).toBe('handed-over');
  });

  it('starts a project, done once the local program opens it, which ends the offer', async () => {
    const { connection, socket } = offering();
    const started = connection.startProject({ sample: 'c4-architecture' });
    expect(socket.lastSent()).toMatchObject({ type: 'start/create', sample: 'c4-architecture' });
    socket.receive(
      encodeServerMessage({
        type: 'project/opened',
        protocolVersion: PROTOCOL_VERSION,
        project: loadSample(),
        history: {},
      }),
    );
    expect(await started).toEqual({ ok: true, created: [], warnings: [] });
    expect(connection.getState().start).toBeUndefined();
    expect(connection.getState().project?.project.name).toBe(loadSample().project.name);
  });

  it('says why a start was refused', async () => {
    const { connection, socket } = offering();
    const started = connection.startProject({});
    const { requestId } = socket.lastSent();
    socket.receive(
      encodeServerMessage({
        type: 'command/rejected',
        requestId,
        problems: [{ code: 'not-saved', message: 'The project here is being started already.' }],
      }),
    );
    expect(await started).toEqual({
      ok: false,
      problems: [{ code: 'not-saved', message: 'The project here is being started already.' }],
    });
    expect(connection.getState().start).toBeDefined();
  });
});
