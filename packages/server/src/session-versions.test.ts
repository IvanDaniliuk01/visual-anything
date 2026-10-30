/**
 * The session's versions (ADR 0070, ADR 0071): it keeps the project as opened, and answers
 * `versions/list` and `version/compare` from an app and from Claude's endpoint, with the comparison
 * worked out against the project now. An app gets the version's project; Claude does not (ADR-0029).
 */
import { join } from 'node:path';
import {
  compareProjects,
  decodeServerMessage,
  recompare,
  type ServerMessage,
} from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { attachClaude } from './claude/endpoint';
import type { ProgramMessage } from './claude/messages';
import { openSession, type Session } from './session';
import { FakeClient, testProject, writeProjectFolder } from './test-support';
import {
  NO_GIT,
  matching,
  commitProject,
  git,
  recordingSpawn,
  removeFolder,
  temporaryFolder,
} from './versions/test-repositories';
import { NOT_LISTED } from './versions/versions';

let root: string;
const opened: Session[] = [];

beforeEach(async () => {
  root = await temporaryFolder('va-session-versions-');
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await removeFolder(root);
});

async function open(folder = root, spawn = recordingSpawn()): Promise<Session> {
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    versions: { spawn: spawn.spawn, warn: () => {} },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  opened.push(result.session);
  return result.session;
}

/** Sends a message from an app, and gives back what it was answered. */
async function ask(session: Session, client: FakeClient, message: object): Promise<ServerMessage> {
  const before = client.messages.length;
  await session.receive(client, JSON.stringify({ requestId: 'r1', ...message }));
  const answers = client.messages.slice(before);
  expect(answers).toHaveLength(1);
  // What the program sends must read as the protocol says.
  return decodeServerMessage(JSON.stringify(answers[0]));
}

const RENAME = { type: 'update-element', id: 'api', changes: { name: 'Gateway' } } as const;

describe('the version as opened', () => {
  it('compares with the project now, without git, and follows the session’s changes', async () => {
    await writeProjectFolder(root, testProject());
    const session = await open();
    const client = new FakeClient();
    session.connect(client);
    await session.execute(RENAME, 'user');

    const answer = await ask(session, client, {
      type: 'version/compare',
      version: { kind: 'opened' },
    });
    expect(answer).toMatchObject({ type: 'version/compared', version: { kind: 'opened' } });
    if (answer.type !== 'version/compared') return;
    expect(answer.project).toEqual(testProject());
    expect(answer.comparison).toEqual(compareProjects(testProject(), session.snapshot));
    expect(answer.comparison.counts.changed).toBeGreaterThan(0);
  });

  it('is the project as last read again from disk', async () => {
    await writeProjectFolder(root, testProject());
    const result = await openSession(root, {
      watch: { delay: 50 },
      out: () => {},
      err: () => {},
      versions: { warn: () => {} },
    });
    if (!result.ok) throw new Error('It does not open.');
    const session = result.session;
    opened.push(session);
    const client = new FakeClient();
    session.connect(client);
    const changed = { ...testProject(), project: { ...testProject().project, name: 'Changed' } };
    await writeProjectFolder(root, changed);
    await expect.poll(() => client.ofType('project/reloaded'), { timeout: 5000 }).toHaveLength(1);
    const answer = await ask(session, client, {
      type: 'version/compare',
      version: { kind: 'opened' },
    });
    expect(answer.type === 'version/compared' && answer.project).toEqual(changed);
    expect(answer.type === 'version/compared' && answer.comparison.changes).toEqual([]);
  });

  it('compares one view, and refuses a view neither version has', async () => {
    await writeProjectFolder(root, testProject());
    const session = await open();
    const client = new FakeClient();
    session.connect(client);
    await session.execute(RENAME, 'user');
    const one = await ask(session, client, {
      type: 'version/compare',
      version: { kind: 'opened' },
      view: 'overview',
    });
    expect(one.type).toBe('version/compared');
    const none = await ask(session, client, {
      type: 'version/compare',
      version: { kind: 'opened' },
      view: 'nowhere',
    });
    expect(none).toEqual({
      type: 'version/refused',
      requestId: 'r1',
      problems: [
        {
          code: 'unknown-view',
          message: 'Neither the version nor the project now has the view "nowhere".',
        },
      ],
    });
  });

  it('lets an app follow every later action with recompare', async () => {
    await writeProjectFolder(root, testProject());
    const session = await open();
    const client = new FakeClient();
    session.connect(client);
    const answer = await ask(session, client, {
      type: 'version/compare',
      version: { kind: 'opened' },
    });
    if (answer.type !== 'version/compared' || answer.project === undefined) throw new Error('no');
    const before = session.snapshot;
    await session.execute(RENAME, 'user');
    const [change] = client.ofType('project/changed');
    const followed = recompare(
      answer.comparison,
      answer.project,
      session.snapshot,
      change?.operations ?? [],
    );
    expect(followed).toEqual(compareProjects(answer.project, session.snapshot));
    expect(before).not.toBe(session.snapshot);
  });
});

describe('a commit named by an app', () => {
  it('is refused before git hears of it unless a recent listing has it', async () => {
    await writeProjectFolder(root, testProject());
    const spawn = recordingSpawn();
    const session = await open(root, spawn);
    const client = new FakeClient();
    session.connect(client);
    const answer = await ask(session, client, {
      type: 'version/compare',
      version: { kind: 'commit', commit: 'a'.repeat(40) },
    });
    expect(answer).toEqual({
      type: 'version/refused',
      requestId: 'r1',
      problems: [{ code: 'invalid-command', message: NOT_LISTED }],
    });
    expect(spawn.calls).toEqual([]);
  });

  it('is refused when it is not a commit id, as the protocol reads it', async () => {
    await writeProjectFolder(root, testProject());
    const spawn = recordingSpawn();
    const session = await open(root, spawn);
    const client = new FakeClient();
    session.connect(client);
    for (const commit of ['HEAD', 'main', '--output=x', 'A'.repeat(40)]) {
      const answer = await ask(session, client, {
        type: 'version/compare',
        version: { kind: 'commit', commit },
      });
      expect(answer.type).toBe('command/rejected');
    }
    expect(spawn.calls).toEqual([]);
  });

  it('says why a folder outside any repository lists no version', async () => {
    await writeProjectFolder(root, testProject());
    const session = await open();
    const client = new FakeClient();
    session.connect(client);
    const answer = await ask(session, client, { type: 'versions/list' });
    expect(answer).toMatchObject({
      type: 'versions/listed',
      versions: [],
      why: matching(/not in a git repository/),
    });
  });
});

describe.skipIf(NO_GIT)('a commit of the repository', () => {
  it('is listed, then compared with the project now, the app getting its project', async () => {
    const first = await commitProject(root, testProject(), { prefix: 'shop' });
    const session = await open(join(root, 'shop'));
    const client = new FakeClient();
    session.connect(client);
    await session.execute(RENAME, 'user');

    const listed = await ask(session, client, { type: 'versions/list' });
    expect(listed.type).toBe('versions/listed');
    if (listed.type !== 'versions/listed') return;
    expect(listed.why).toBeUndefined();
    expect(listed.versions.map((each) => each.kind)).toEqual(['head', 'branch', 'commit']);
    expect(listed.versions.every((each) => each.commit === first)).toBe(true);

    const compared = await ask(session, client, {
      type: 'version/compare',
      version: { kind: 'commit', commit: first },
    });
    expect(compared.type).toBe('version/compared');
    if (compared.type !== 'version/compared') return;
    expect(compared.project).toEqual(testProject());
    expect(compared.comparison).toEqual(compareProjects(testProject(), session.snapshot));
  });

  it('says file by file why a commit’s project does not open', async () => {
    await commitProject(root, testProject());
    git(root, 'rm', '-q', 'model.vamodel');
    git(root, 'commit', '-q', '-m', 'Lose the model');
    const broken = git(root, 'rev-parse', 'HEAD').trim();
    git(root, 'checkout', '-q', 'HEAD~1', '--', 'model.vamodel');
    const session = await open();
    const client = new FakeClient();
    session.connect(client);
    await ask(session, client, { type: 'versions/list' });
    const answer = await ask(session, client, {
      type: 'version/compare',
      version: { kind: 'commit', commit: broken },
    });
    expect(answer).toEqual({
      type: 'version/refused',
      requestId: 'r1',
      problems: [
        {
          code: 'invalid-file',
          message: '.: The folder has no .vamodel file; a project has exactly one.',
        },
      ],
    });
  });

  it('answers Claude through its endpoint, without the version’s project', async () => {
    const first = await commitProject(root, testProject());
    const session = await open();
    const sent: ProgramMessage[] = [];
    const claude = attachClaude(session, (message) => sent.push(message));
    await session.execute(RENAME, 'claude');

    await claude.receive(JSON.stringify({ type: 'versions/list', requestId: 'c1' }));
    const listed = sent.find((each) => each.type === 'versions/listed');
    expect(listed).toMatchObject({ requestId: 'c1', versions: expect.any(Array) as unknown[] });

    await claude.receive(
      JSON.stringify({
        type: 'version/compare',
        requestId: 'c2',
        version: { kind: 'commit', commit: first },
      }),
    );
    const compared = sent.find((each) => each.type === 'version/compared');
    expect(compared).toMatchObject({ requestId: 'c2', version: { kind: 'commit', commit: first } });
    expect(compared && 'project' in compared).toBe(false);
    expect(compared?.type === 'version/compared' && compared.comparison).toEqual(
      compareProjects(testProject(), session.snapshot),
    );

    await claude.receive(
      JSON.stringify({
        type: 'version/compare',
        requestId: 'c3',
        version: { kind: 'commit', commit: 'b'.repeat(40) },
      }),
    );
    expect(sent.find((each) => each.type === 'version/refused')).toEqual({
      type: 'version/refused',
      requestId: 'c3',
      problems: [{ code: 'invalid-command', message: NOT_LISTED }],
    });
    claude.detach();
  });
});
