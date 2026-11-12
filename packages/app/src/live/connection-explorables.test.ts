/**
 * Explorables over the live connection (ADR 0107): the listener asked for once, Claude's requests for
 * a script library kept until the person answers and what came of them, a fetch the person asked for
 * answered at once, the files of `script-libraries/` listed, and who last changed each explorable's
 * text.
 */
import {
  PROTOCOL_VERSION,
  encodeServerMessage,
  registryAddresses,
  type ScriptLibraryConsentMessage,
} from '@visual-anything/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadSample } from '../test/sample';
import { FakeWebSocket } from '../test/FakeWebSocket';
import { LiveConnection } from './connection';

const LIVE_URL = 'ws://localhost:3000/live?token=s3cr3t';
const HASH = 'f'.repeat(64);

beforeEach(() => {
  FakeWebSocket.created = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

function openConnection() {
  const connection = new LiveConnection(LIVE_URL);
  connection.connect();
  const socket = FakeWebSocket.created.at(-1) as FakeWebSocket;
  socket.accept();
  socket.receive(
    encodeServerMessage({
      type: 'project/opened',
      protocolVersion: PROTOCOL_VERSION,
      project: loadSample(),
      history: {},
    }),
  );
  return { connection, socket };
}

function requestIdOf(socket: FakeWebSocket): string {
  const sent = socket.lastSent() as { requestId?: string };
  if (sent.requestId === undefined) throw new Error('The last message names no request.');
  return sent.requestId;
}

const LIBRARY = {
  id: 'shop.d3',
  npm: 'd3',
  version: '7.9.0',
  tarball: registryAddresses('d3', '7.9.0').tarball,
  integrity: `sha512-${'A'.repeat(86)}==`,
  path: 'dist/d3.min.js',
  global: 'd3',
  hash: HASH,
  bytes: 280_000,
};

function consent(requestId: string, asker: 'claude' | 'person'): ScriptLibraryConsentMessage {
  return {
    type: 'script-library/consent',
    requestId,
    asker,
    package: 'shop',
    npm: 'd3',
    version: '7.9.0',
    ...registryAddresses('d3', '7.9.0'),
  };
}

describe('explorables over the live connection', () => {
  it('asks for the listener, and reads its port and nonce', async () => {
    const { connection, socket } = openConnection();
    const asked = connection.listenExplorables();
    const requestId = requestIdOf(socket);
    expect(socket.lastSent()).toEqual({ type: 'explorables/listen', requestId });
    socket.receive(
      encodeServerMessage({
        type: 'explorables/listening',
        requestId,
        port: 47850,
        nonce: 'n'.repeat(22),
      }),
    );
    expect(await asked).toEqual({
      ok: true,
      answer: { type: 'explorables/listening', requestId, port: 47850, nonce: 'n'.repeat(22) },
    });
  });

  it('keeps Claude’s request until the person answers, then what came of it', () => {
    const { connection, socket } = openConnection();
    socket.receive(encodeServerMessage(consent('script-library-1', 'claude')));
    expect(connection.getState().scriptLibraryConsents).toEqual([
      consent('script-library-1', 'claude'),
    ]);
    connection.answerScriptLibraryConsent('script-library-1', true);
    expect(socket.lastSent()).toEqual({
      type: 'script-library/consented',
      requestId: 'script-library-1',
      approved: true,
    });
    expect(connection.getState().scriptLibraryConsents).toEqual([]);
    socket.receive(
      encodeServerMessage({
        type: 'script-library/kept',
        requestId: 'script-library-1',
        library: LIBRARY,
      }),
    );
    expect(connection.getState().scriptLibraryOutcomes).toEqual([
      { requestId: 'script-library-1', kept: LIBRARY },
    ]);
  });

  it('answers at once the consent for a fetch the person asked for in this tab', async () => {
    const { connection, socket } = openConnection();
    const fetching = connection.fetchScriptLibrary({
      package: 'shop',
      npm: 'd3',
      version: '7.9.0',
    });
    const requestId = requestIdOf(socket);
    socket.receive(encodeServerMessage(consent(requestId, 'person')));
    expect(socket.lastSent()).toEqual({
      type: 'script-library/consented',
      requestId,
      approved: true,
    });
    expect(connection.getState().scriptLibraryConsents ?? []).toEqual([]);
    socket.receive(
      encodeServerMessage({ type: 'script-library/kept', requestId, library: LIBRARY }),
    );
    expect(await fetching).toMatchObject({ ok: true, answer: { library: LIBRARY } });
  });

  it('lists and removes the files no package names', async () => {
    const { connection, socket } = openConnection();
    const listing = connection.listScriptLibraryFiles();
    const requestId = requestIdOf(socket);
    expect(socket.lastSent()).toEqual({ type: 'script-library-files/list', requestId });
    socket.receive(
      encodeServerMessage({
        type: 'script-library-files/listed',
        requestId,
        files: [{ hash: HASH, bytes: 3 }],
      }),
    );
    expect(await listing).toMatchObject({
      ok: true,
      answer: { files: [{ hash: HASH, bytes: 3 }] },
    });
    const removing = connection.removeScriptLibraryFiles([HASH]);
    const removal = requestIdOf(socket);
    socket.receive(
      encodeServerMessage({
        type: 'script-library/refused',
        requestId: removal,
        code: 'program-failed',
        message: 'No.',
      }),
    );
    expect(await removing).toEqual({
      ok: false,
      problems: [{ code: 'program-failed', message: 'No.' }],
    });
  });

  it('knows who last changed an explorable’s text', () => {
    const { connection, socket } = openConnection();
    const change = (kind: 'do' | 'undo', author: 'user' | 'claude') =>
      socket.receive(
        encodeServerMessage({
          type: 'project/changed',
          operations: [
            kind === 'do'
              ? {
                  op: 'insert',
                  collection: { name: 'explorableTexts' },
                  index: 0,
                  item: { id: 'shop.plot', text: '<p>1</p>' },
                }
              : { op: 'remove', collection: { name: 'explorableTexts' }, key: 'shop.plot' },
          ],
          kind,
          label: 'Write',
          author,
          history: {},
          warnings: [],
          created: [],
        } as never),
      );
    change('do', 'claude');
    expect(connection.getState().explorableAuthors?.get('shop.plot')).toBe('claude');
    change('undo', 'claude');
    expect(connection.getState().explorableAuthors?.get('shop.plot')).toBeUndefined();
  });
});
