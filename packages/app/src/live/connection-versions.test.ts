/**
 * Versions over the live connection (ADR 0071): the tab asks for the versions the program lists, and
 * to compare one of them with the project now, and hears the answer or why there is none.
 */
import {
  PROTOCOL_VERSION,
  compareProjects,
  encodeServerMessage,
  type ListedVersion,
} from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { comparedSample } from '../test/comparison';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { LiveConnection } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';

const MAIN: ListedVersion = {
  kind: 'branch',
  name: 'main',
  commit: 'a'.repeat(40),
  short: 'aaaaaaa',
  subject: 'Add the SMS channel',
  author: 'Ana',
  time: Date.UTC(2026, 9, 28, 10, 0),
};

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

function openConnection() {
  const { older, newer } = comparedSample();
  const connection = new LiveConnection(LIVE_URL);
  connection.connect();
  const socket = FakeWebSocket.created.at(-1) as FakeWebSocket;
  socket.accept();
  socket.receive(
    encodeServerMessage({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: newer,
      history: {},
    }),
  );
  return { connection, socket, older, newer };
}

function requestIdOf(socket: FakeWebSocket): string {
  const sent = socket.lastSent() as { requestId?: string };
  if (sent.requestId === undefined) throw new Error('The last message names no request.');
  return sent.requestId;
}

describe('listing versions', () => {
  it('asks the program, and resolves with the versions it lists', async () => {
    const { connection, socket } = openConnection();

    const listing = connection.listVersions();
    expect(socket.lastSent()).toMatchObject({ type: 'versions/list' });
    socket.receive(
      encodeServerMessage({
        type: 'versions/listed',
        requestId: requestIdOf(socket),
        versions: [MAIN],
      }),
    );

    await expect(listing).resolves.toMatchObject({ ok: true, answer: { versions: [MAIN] } });
  });

  it('resolves with why no commit could be listed', async () => {
    const { connection, socket } = openConnection();

    const listing = connection.listVersions();
    socket.receive(
      encodeServerMessage({
        type: 'versions/listed',
        requestId: requestIdOf(socket),
        versions: [],
        why: 'The project folder is not in a git repository.',
      }),
    );

    await expect(listing).resolves.toMatchObject({
      ok: true,
      answer: { versions: [], why: 'The project folder is not in a git repository.' },
    });
  });

  it('says it is not connected when it is not', async () => {
    const connection = new LiveConnection(LIVE_URL);

    await expect(connection.listVersions()).resolves.toMatchObject({
      ok: false,
      problems: [{ code: 'connection-closed' }],
    });
  });
});

describe('comparing a version', () => {
  it('asks for the version, and resolves with it, its comparison and the project it was compared with', async () => {
    const { connection, socket, older, newer } = openConnection();

    const compared = connection.compareVersion({ kind: 'commit', commit: MAIN.commit });
    expect(socket.lastSent()).toMatchObject({
      type: 'version/compare',
      version: { kind: 'commit', commit: MAIN.commit },
    });
    const comparison = compareProjects(older, newer);
    socket.receive(
      encodeServerMessage({
        type: 'version/compared',
        requestId: requestIdOf(socket),
        version: { kind: 'commit', commit: MAIN.commit },
        project: older,
        comparison,
      }),
    );

    const result = await compared;
    if (!result.ok) throw new Error('It was refused.');
    expect(result.older).toEqual(older);
    expect(result.comparison).toEqual(comparison);
    // The newer version is the project as this tab knew it when the answer came.
    expect(result.newer).toBe(connection.getState().project);
  });

  it('names the view, when asked for one', () => {
    const { connection, socket } = openConnection();

    void connection.compareVersion({ kind: 'opened' }, 'system-overview');

    expect(socket.lastSent()).toMatchObject({
      type: 'version/compare',
      version: { kind: 'opened' },
      view: 'system-overview',
    });
  });

  it('resolves with the problems of a refusal', async () => {
    const { connection, socket } = openConnection();

    const compared = connection.compareVersion({ kind: 'commit', commit: MAIN.commit });
    const problem = {
      code: 'invalid-command' as const,
      message: 'That commit is not one the program listed in its latest listing of versions.',
    };
    socket.receive(
      encodeServerMessage({
        type: 'version/refused',
        requestId: requestIdOf(socket),
        problems: [problem],
      }),
    );

    await expect(compared).resolves.toEqual({ ok: false, problems: [problem] });
  });

  it('refuses an answer that brings no version to draw', async () => {
    const { connection, socket, older, newer } = openConnection();

    const compared = connection.compareVersion({ kind: 'opened' });
    socket.receive(
      encodeServerMessage({
        type: 'version/compared',
        requestId: requestIdOf(socket),
        version: { kind: 'opened' },
        comparison: compareProjects(older, newer),
      }),
    );

    await expect(compared).resolves.toMatchObject({
      ok: false,
      problems: [{ code: 'program-failed' }],
    });
  });

  it('answers a request waiting when the connection closes', async () => {
    const { connection } = openConnection();

    const compared = connection.compareVersion({ kind: 'opened' });
    connection.disconnect();

    await expect(compared).resolves.toMatchObject({
      ok: false,
      problems: [{ code: 'connection-closed' }],
    });
  });
});
