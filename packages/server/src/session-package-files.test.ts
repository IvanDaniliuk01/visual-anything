/**
 * Reading a package file the person chose in an app (ADR 0089's M14.2 clarification): the program
 * parses its text and checks it against the package file's schema, running nothing, and answers with
 * the package or with what the schema found. It changes nothing in the project.
 */
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ServerMessage } from '@visual-anything/core';
import type { PackageFile } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openSession, type SessionClient } from './session';
import { testProject, writeProjectFolder } from './test-support';

let root: string;
let folder: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'va-package-file-')));
  folder = join(root, 'project');
  await writeProjectFolder(folder, testProject());
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true, maxRetries: 10 });
});

const GAUGES: PackageFile = {
  id: 'gauges',
  name: 'Gauges',
  version: '1.0.0',
  components: [{ id: 'gauges.gauge', name: 'Gauge', derivesFrom: 'essence' }],
  relationTypes: [],
  // Code the file only holds: reading it never runs it.
  code: ['globalThis.ran = true;', 'export function check() { return []; }'],
  capabilities: ['model:read'],
};

const BOM = String.fromCharCode(0xfeff);

async function answersTo(texts: readonly string[]): Promise<ServerMessage[]> {
  const opened = await openSession(folder, { watch: false, out: () => {}, err: () => {} });
  if (!opened.ok) throw new Error('The project does not open.');
  const { session } = opened;
  const said: ServerMessage[] = [];
  const client: SessionClient = { send: (message) => said.push(message) };
  try {
    for (const [at, text] of texts.entries()) {
      await session.receive(
        client,
        JSON.stringify({ type: 'package/read', requestId: `r${at}`, name: 'a.vapackage', text }),
      );
    }
    expect(session.actions).toEqual([]);
    return said;
  } finally {
    await session.close();
  }
}

describe('reading a package file for an app', () => {
  it('answers with the package the schema finds valid, running nothing it holds', async () => {
    // With a byte order mark first, as some editors write one.
    const said = await answersTo([BOM + JSON.stringify(GAUGES, null, 2)]);
    expect(said).toEqual([{ type: 'package/read-answer', requestId: 'r0', package: GAUGES }]);
    expect((globalThis as { ran?: boolean }).ran).toBeUndefined();
  }, 60_000);

  it('refuses what the schema refuses, saying where, and text that is no JSON', async () => {
    const said = await answersTo([
      JSON.stringify({ ...GAUGES, name: '' }),
      JSON.stringify({ id: 'gauges', components: [], relationTypes: [], extra: 1 }),
      '{ not json',
    ]);
    expect(said).toEqual([
      {
        type: 'command/rejected',
        requestId: 'r0',
        problems: [
          { code: 'invalid-command', message: 'In the package file, /name must not be empty.' },
        ],
      },
      {
        type: 'command/rejected',
        requestId: 'r1',
        problems: expect.arrayContaining([
          { code: 'invalid-command', message: 'The package file must have the key "name".' },
          { code: 'invalid-command', message: 'The package file must not have the key "extra".' },
        ]) as unknown,
      },
      {
        type: 'command/rejected',
        requestId: 'r2',
        problems: [{ code: 'invalid-command', message: 'The file is not valid JSON.' }],
      },
    ]);
  }, 60_000);

  it('refuses a request whose text is past 2 MiB before reading it', async () => {
    const said = await answersTo(['x'.repeat(2 * 1024 * 1024 + 1)]);
    expect(said).toHaveLength(1);
    expect(said[0]).toMatchObject({
      type: 'command/rejected',
      problems: [
        {
          code: 'invalid-command',
          message: 'Reading a package file needs its text, of at most 2 MiB.',
        },
      ],
    });
  }, 60_000);
});
