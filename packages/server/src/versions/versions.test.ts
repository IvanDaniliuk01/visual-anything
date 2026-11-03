/**
 * The versions the program reads (ADR 0071): only commits of its last five listings within ten minutes,
 * from an app or from Claude alike, one read at a time,
 * a newer request stopping the one under way, within the time a read has; and a comparison kept to one
 * view.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { compareProjects, executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testProject } from '../test-support';
import type { GitProcess, Spawn } from './git';
import {
  NO_GIT,
  matching,
  commitProject,
  git,
  recordingSpawn,
  removeFolder,
  temporaryFolder,
  type RecordedCall,
} from './test-repositories';
import {
  LISTING_KEPT_MS,
  NOT_LISTED,
  RECENT_LISTINGS,
  Versions,
  comparisonOfView,
} from './versions';

let root: string;

beforeEach(async () => {
  root = await temporaryFolder();
});

afterEach(async () => {
  await removeFolder(root);
});

/** A process that never answers, until it is killed. */
function hangingProcess(): GitProcess {
  const process = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: () => {
      setImmediate(() => process.emit('close', null));
      return true;
    },
  });
  return process;
}

/** Starts git as the program does, but holds every `cat-file` while `hold` says so. */
function holdingSpawn(hold: () => boolean): { spawn: Spawn; calls: RecordedCall[] } {
  const recording = recordingSpawn();
  const spawn: Spawn = (file, args, options) => {
    if (args.includes('cat-file') && hold()) {
      recording.calls.push({ file, args, options, input: '' });
      return hangingProcess();
    }
    return recording.spawn(file, args, options);
  };
  return { spawn, calls: recording.calls };
}

// Each test starts git several times, and git started on a loaded Windows machine took up to four
// seconds each time: "keeps the commits of its last five listings", which starts it for two commits,
// a reset, six listings and two reads, ran past 20 s, and once past 90 s. Nothing here is timed.
describe.skipIf(NO_GIT)('reading versions', { timeout: 300_000 }, () => {
  it('refuses a commit not in the latest listing before git hears of it', async () => {
    const first = await commitProject(root, testProject());
    const { spawn, calls } = recordingSpawn();
    const versions = new Versions(root, { spawn, warn: () => {} });
    expect(await versions.read(first)).toEqual({
      ok: false,
      problems: [{ code: 'invalid-command', message: NOT_LISTED }],
    });
    expect(calls).toEqual([]);
    await versions.list();
    expect((await versions.read(first)).ok).toBe(true);
    const second = await commitProject(
      root,
      { ...testProject(), project: { ...testProject().project, name: 'Later' } },
      { init: false },
    );
    const before = calls.length;
    expect(await versions.read(second)).toMatchObject({ ok: false });
    expect(calls).toHaveLength(before);
    versions.close();
  });

  it('keeps the commits of its last five listings, so a later listing never refuses an earlier one', async () => {
    const first = await commitProject(root, testProject());
    const second = await commitProject(
      root,
      { ...testProject(), project: { ...testProject().project, name: 'Second' } },
      { init: false },
    );
    const versions = new Versions(root, { warn: () => {} });
    await versions.list();
    // The second commit leaves the repository's listing: HEAD goes back to the first.
    git(root, 'reset', '-q', '--hard', first);
    const later = await versions.list();
    expect(later.versions.map((each) => each.commit)).not.toContain(second);
    expect(versions.isListed(second)).toBe(true);
    expect(await versions.read(second)).toMatchObject({ ok: true });
    // Four listings more make five without it, and it goes.
    for (let count = 2; count <= RECENT_LISTINGS; count += 1) {
      expect(versions.isListed(second)).toBe(true);
      await versions.list();
    }
    expect(versions.isListed(second)).toBe(false);
    expect(await versions.read(second)).toEqual({
      ok: false,
      problems: [{ code: 'invalid-command', message: NOT_LISTED }],
    });
    expect(versions.isListed(first)).toBe(true);
    versions.close();
  });

  it('keeps a listing’s commits for ten minutes', async () => {
    const commit = await commitProject(root, testProject());
    let now = 1_000_000;
    const versions = new Versions(root, { warn: () => {}, now: () => now });
    await versions.list();
    now += LISTING_KEPT_MS;
    expect(versions.isListed(commit)).toBe(true);
    now += 1;
    expect(versions.isListed(commit)).toBe(false);
    expect(await versions.read(commit)).toMatchObject({ ok: false });
    await versions.list();
    expect(versions.isListed(commit)).toBe(true);
    versions.close();
  });

  it('keeps the earlier listings when one fails', async () => {
    const commit = await commitProject(root, testProject());
    let failing = false;
    const recording = recordingSpawn();
    const spawn: Spawn = (file, args, options) =>
      failing && args.includes('for-each-ref')
        ? recording.spawn(file, ['--no-such-option'], options)
        : recording.spawn(file, args, options);
    const versions = new Versions(root, { spawn, warn: () => {} });
    await versions.list();
    failing = true;
    expect((await versions.list()).why).toBeDefined();
    expect(versions.isListed(commit)).toBe(true);
    versions.close();
  });

  it('keeps the version read last, and reads it again only when another was read since', async () => {
    await commitProject(root, testProject());
    const { spawn, calls } = recordingSpawn();
    const versions = new Versions(root, { spawn, warn: () => {} });
    const [head] = (await versions.list()).versions;
    const first = await versions.read(head?.commit ?? '');
    const reads = calls.length;
    const again = await versions.read(head?.commit ?? '');
    expect(again).toEqual(first);
    expect(calls).toHaveLength(reads);
    versions.close();
  });

  it('stops the read under way when another version is asked for', async () => {
    const first = await commitProject(root, testProject());
    const second = await commitProject(
      root,
      { ...testProject(), project: { ...testProject().project, name: 'Second' } },
      { init: false },
    );
    let holding = true;
    const { spawn } = holdingSpawn(() => holding);
    const versions = new Versions(root, { spawn, warn: () => {} });
    await versions.list();
    const stopped = versions.read(first);
    // Once the first read waits on its batch, the second is asked for.
    await new Promise((resolve) => setTimeout(resolve, 300));
    holding = false;
    const read = await versions.read(second);
    expect(await stopped).toEqual({
      ok: false,
      problems: [
        {
          code: 'program-failed',
          message: 'Another version was asked for, so reading this one stopped.',
        },
      ],
    });
    expect(read.ok && read.project.project.name).toBe('Second');
    versions.close();
  });

  it('stops a read that takes longer than a read may', async () => {
    const commit = await commitProject(root, testProject());
    const { spawn } = holdingSpawn(() => true);
    const versions = new Versions(root, { spawn, warn: () => {}, limits: { readMs: 1000 } });
    await versions.list();
    expect(await versions.read(commit)).toEqual({
      ok: false,
      problems: [
        {
          code: 'program-failed',
          message: 'Reading the version took longer than 1 s, so it was stopped.',
        },
      ],
    });
    versions.close();
  });

  it('says why a folder outside any repository lists no version', async () => {
    const versions = new Versions(root, { warn: () => {} });
    expect(await versions.list()).toEqual({
      versions: [],
      why: matching(/not in a git repository/),
    });
    versions.close();
  });
});

describe('without git', () => {
  it('says what is needed', async () => {
    const versions = new Versions(root, {
      env: { PATH: '' },
      warn: () => {},
    });
    expect(await versions.list()).toEqual({
      versions: [],
      why: matching(/needs git 2\.36 or later, and none was found/),
    });
    versions.close();
  });
});

describe('a comparison kept to one view', () => {
  function changed(project: ProjectSnapshot): ProjectSnapshot {
    let state = project;
    for (const command of [
      { type: 'update-element', id: 'api', changes: { name: 'Gateway' } },
      { type: 'update-view', id: 'overview', changes: { name: 'Overview now' } },
    ] as const) {
      const outcome = executeCommand(state, command);
      if (!outcome.ok) throw new Error(JSON.stringify(outcome.problems));
      state = outcome.state;
    }
    return state;
  }

  it('keeps the changes of the view and of what it draws, with their counts and names', () => {
    const older = testProject();
    const newer = changed(older);
    const whole = compareProjects(older, newer);
    const view = comparisonOfView(whole, older, newer, 'overview');
    expect(view.changes.length).toBeGreaterThan(0);
    expect(view.changes.every((change) => whole.changes.includes(change))).toBe(true);
    expect(view.counts.changed).toBe(
      view.changes.filter((each) => each.status === 'changed').length,
    );
    for (const id of Object.keys(view.names)) expect(whole.names[id]).toEqual(view.names[id]);
  });

  it('keeps nothing of a view that draws none of what changed', () => {
    const older = testProject();
    const newer = changed(older);
    const whole = compareProjects(older, newer);
    expect(comparisonOfView(whole, older, newer, 'no-such-view')).toEqual({
      changes: [],
      counts: { added: 0, removed: 0, changed: 0, moved: 0 },
      names: {},
    });
  });
});
