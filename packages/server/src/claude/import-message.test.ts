/**
 * The Claude endpoint's `import` message (ADR-0049): `visual-anything import` sends the program that
 * runs on the project the file and the person's choices, never a command. The program reads and
 * maps the file itself, so that nothing but an import of that content runs as the person's.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProtocolError } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type Session } from '../session';
import { testProject, writeProjectFolder } from '../test-support';
import { attachClaude } from './endpoint';
import {
  decodeClaudeMessage,
  importMessageRequest,
  importRequestOf,
  type ProgramMessage,
} from './messages';

const message = (request: unknown) => JSON.stringify({ type: 'import', requestId: 'r1', request });
const base64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

describe('the import message', () => {
  it('carries a file, in base64, and the person’s choices', () => {
    const request = {
      name: 'services.csv',
      bytes: base64('name\nCache\n'),
      format: 'csv',
      key: 'id',
      map: { service: 'systems.service' },
      nesting: 'systems.is-part-of',
      views: false,
    };
    expect(decodeClaudeMessage(message(request))).toEqual({
      type: 'import',
      requestId: 'r1',
      request,
    });
  });

  it('keeps a kind named like something every object inherits as a kind', () => {
    const decoded = decodeClaudeMessage(
      message({
        name: 'a.csv',
        bytes: '',
        map: JSON.parse('{"__proto__": "systems.box"}') as Record<string, string>,
      }),
    );
    if (decoded.type !== 'import') throw new Error('not an import');
    expect(Object.hasOwn(decoded.request.map ?? {}, '__proto__')).toBe(true);
    expect(Object.getPrototypeOf(decoded.request.map)).toBe(Object.prototype);
  });

  it.each([
    ['a command instead of a file', { command: { type: 'batch', label: 'Import "a"' } }],
    ['a command beside the file', { name: 'a.csv', bytes: '', command: { type: 'delete' } }],
    ['no file name', { bytes: '' }],
    ['a file that is not base64', { name: 'a.csv', bytes: 'not base64!' }],
    ['a map to something that is not an id', { name: 'a.csv', bytes: '', map: { a: 1 } }],
    ['views that are not true or false', { name: 'a.csv', bytes: '', views: 'yes' }],
    ['nothing', undefined],
  ])('refuses %s', (_what, request) => {
    expect(() => decodeClaudeMessage(message(request))).toThrow(ProtocolError);
  });

  it('goes there and back, bytes included', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 255]);
    const sent = importMessageRequest({ name: 'a.drawio.png', text: '', bytes, views: true });
    expect(importRequestOf(sent)).toEqual({
      name: 'a.drawio.png',
      text: new TextDecoder('utf-8').decode(bytes),
      bytes,
      views: true,
    });
    const text = importMessageRequest({ name: 'a.mmd', text: 'flowchart LR\n  a --> b\n' });
    expect(importRequestOf(text).text).toBe('flowchart LR\n  a --> b\n');
  });
});

describe('an import through the Claude endpoint', () => {
  let root: string;
  let session: Session;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'va-import-message-'));
    await writeProjectFolder(root, testProject());
    const opened = await openSession(root, { watch: false, out: () => {}, err: () => {} });
    if (!opened.ok) throw new Error('The project does not open.');
    session = opened.session;
  });

  afterEach(async () => {
    await session.close();
    await rm(root, { recursive: true, force: true });
  });

  function attach() {
    const answers: ProgramMessage[] = [];
    const claude = attachClaude(session, (answer) => answers.push(answer));
    return { claude, answers };
  }

  it('reads and maps the file in the program, and runs what that makes as the person’s', async () => {
    const { claude, answers } = attach();
    const request = importMessageRequest({ name: 'more.csv', text: 'name\nCache\n' });
    await claude.receive(JSON.stringify({ type: 'import', requestId: 'r1', request }));
    expect(answers.at(-1)?.type).toBe('project/changed');
    expect(session.actions.at(-1)).toMatchObject({ label: 'Import "more.csv"', author: 'user' });
    expect(session.snapshot.model.elements.some((each) => each.name === 'Cache')).toBe(true);
  });

  it('runs no command dressed as an import', async () => {
    const { claude, answers } = attach();
    const before = session.snapshot;
    const disguised = {
      type: 'batch',
      label: 'Import "innocent.csv"',
      commands: [{ type: 'delete', elements: before.model.elements.map((each) => each.id) }],
    };
    await claude.receive(JSON.stringify({ type: 'import', requestId: 'r2', command: disguised }));
    expect(answers.at(-1)?.type).toBe('command/rejected');
    expect(session.snapshot).toBe(before);
    expect(session.actions).toEqual([]);
  });

  it('plans the import against the project the commands queued before it leave', async () => {
    const { claude, answers } = attach();
    // Claude creates the element, and the import, sent before that command has run, updates it.
    const created = claude.receive(
      JSON.stringify({
        type: 'command',
        requestId: 'r1',
        command: {
          type: 'create-element',
          element: { id: 'cache', component: 'systems.service', name: 'Cache' },
        },
      }),
    );
    const request = importMessageRequest({
      name: 'caches.csv',
      text: 'id,name\ncache,Cache v2\n',
      key: 'id',
    });
    const imported = claude.receive(JSON.stringify({ type: 'import', requestId: 'r2', request }));
    await Promise.all([created, imported]);
    expect(answers.filter((each) => each.type === 'command/rejected')).toEqual([]);
    const caches = session.snapshot.model.elements.filter((each) => each.id.startsWith('cache'));
    expect(caches.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: 'cache', name: 'Cache v2' },
    ]);
    expect(session.actions.map(({ label, author }) => ({ label, author }))).toEqual([
      { label: 'Create "Cache"', author: 'claude' },
      { label: 'Import "caches.csv"', author: 'user' },
    ]);
  });

  it('refuses a file it cannot read, changing nothing', async () => {
    const { claude, answers } = attach();
    const before = session.snapshot;
    const request = importMessageRequest({ name: 'notes.txt', text: 'nothing to import' });
    await claude.receive(JSON.stringify({ type: 'import', requestId: 'r3', request }));
    expect(answers.at(-1)).toMatchObject({ type: 'command/rejected', requestId: 'r3' });
    expect(session.snapshot).toBe(before);
  });
});
