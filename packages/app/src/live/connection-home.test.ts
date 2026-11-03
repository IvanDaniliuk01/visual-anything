/** The live connection while the local program is at home (ADR 0093), and going back there. */
import { PROTOCOL_VERSION, encodeServerMessage } from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { loadSample } from '../test/sample';
import { LiveConnection } from './connection';

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

const home = (extra: object = {}) =>
  encodeServerMessage({
    type: 'home/offered',
    protocolVersion: PROTOCOL_VERSION,
    folder: '/home/ana/Documents/Visual Anything',
    projects: [],
    recent: [{ path: '/gone', missing: true }],
    samples: [],
    ...extra,
  });

const opened = encodeServerMessage({
  type: 'project/opened',
  protocolVersion: PROTOCOL_VERSION,
  project: loadSample(),
  history: { undo: { label: 'Rename', author: 'user' } },
});

function connected() {
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
  return { connection, socket, handed };
}

describe('LiveConnection at home', () => {
  it('keeps the offer, open with no project, and the token handed over', () => {
    const { connection, socket, handed } = connected();
    socket.receive(home({ token: 'handed-over' }));
    expect(connection.getState()).toMatchObject({
      status: 'open',
      project: undefined,
      home: { recent: [{ path: '/gone', missing: true }] },
    });
    expect(handed).toEqual(['handed-over']);
  });

  it('opens a project, done once the program shows it, which ends home', async () => {
    const { connection, socket } = connected();
    socket.receive(home());
    const opening = connection.openProject('/work/shop');
    expect(socket.lastSent()).toMatchObject({ type: 'home/open', path: '/work/shop' });
    socket.receive(opened);
    expect(await opening).toEqual({ ok: true, created: [], warnings: [] });
    expect(connection.getState().home).toBeUndefined();
    expect(connection.getState().project).toBeDefined();
  });

  it('goes home: the project and its history go, and the request is answered', async () => {
    const { connection, socket } = connected();
    socket.receive(opened);
    const back = connection.goHome();
    const { requestId } = socket.lastSent();
    expect(socket.lastSent()).toMatchObject({ type: 'home/close' });
    socket.receive(home({ requestId }));
    expect(await back).toEqual({ ok: true, created: [], warnings: [] });
    expect(connection.getState()).toMatchObject({ project: undefined, history: {} });
    expect(connection.getState().home).toBeDefined();
  });

  it('says why a new project was refused, and stays home', async () => {
    const { connection, socket } = connected();
    socket.receive(home());
    const creating = connection.createProject({ name: 'Mine', sample: 'nothing' });
    const { requestId } = socket.lastSent();
    socket.receive(
      encodeServerMessage({
        type: 'command/rejected',
        requestId,
        problems: [
          { code: 'invalid-command', message: 'There is no sample "nothing" to start from.' },
        ],
      }),
    );
    expect(await creating).toMatchObject({ ok: false });
    expect(connection.getState().home).toBeDefined();
  });

  it('keeps showing home when the connection closes', () => {
    const { connection, socket } = connected();
    socket.receive(home());
    socket.drop();
    expect(connection.getState()).toMatchObject({ status: 'closed' });
  });
});
