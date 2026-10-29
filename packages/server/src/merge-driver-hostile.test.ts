/**
 * The merge driver's hostile inputs (ADR 0072): it reads the three files git gave it as regular files
 * within their kind's cap, uses the path only for its extension and, escaped, in what it says, runs no
 * program, opens no network, loads nothing from the repository and writes nothing but ours. An input
 * that does not read leaves ours as it was, and the driver exits 1.
 */
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ModelFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { parseFile } from '@visual-anything/schema/validate';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EXAMPLES } from './samples-source';
import { filesIn } from './test-support';

const started = vi.hoisted(() => [] as string[]);

// Every way of starting a program, or of opening a connection, fails the test that reaches it.
vi.mock('node:child_process', async (actual) => {
  const real = await actual<typeof import('node:child_process')>();
  const refuse =
    (name: string) =>
    (...args: unknown[]) => {
      started.push(`${name} ${JSON.stringify(args[0])}`);
      throw new Error(`The merge driver started a program: ${name}`);
    };
  return {
    ...real,
    spawn: refuse('spawn'),
    spawnSync: refuse('spawnSync'),
    exec: refuse('exec'),
    execSync: refuse('execSync'),
    execFile: refuse('execFile'),
    execFileSync: refuse('execFileSync'),
    fork: refuse('fork'),
  };
});
vi.mock('node:net', async (actual) => {
  const real = await actual<typeof import('node:net')>();
  const refuse =
    (name: string) =>
    (...args: unknown[]) => {
      started.push(`${name} ${JSON.stringify(args[0])}`);
      throw new Error(`The merge driver opened a connection: ${name}`);
    };
  return { ...real, connect: refuse('connect'), createConnection: refuse('createConnection') };
});

const { runMergeDriver } = await import('./merge-driver');

let folder: string;
let err: string[];

const BASE: ModelFile = {
  world: { id: 'world', component: 'essence', name: 'World' },
  elements: [{ id: 'a', component: 'systems.system', name: 'A' }],
  relations: [],
};
const OURS: ModelFile = { ...BASE, elements: [{ ...BASE.elements[0]!, name: 'Ours' }] };
const THEIRS: ModelFile = { ...BASE, world: { ...BASE.world, name: 'Theirs' } };
const OURS_TEXT = formatFile('model', OURS);

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-merge-hostile-'));
  err = [];
  started.length = 0;
  await writeFile(join(folder, 'O'), formatFile('model', BASE));
  await writeFile(join(folder, 'A'), OURS_TEXT);
  await writeFile(join(folder, 'B'), formatFile('model', THEIRS));
});

afterEach(async () => {
  expect(started).toEqual([]);
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

function run(args: string[]): Promise<number> {
  return runMergeDriver(args, {
    cwd: folder,
    out: (line) => err.push(`out: ${line}`),
    err: (line) => err.push(line),
  });
}

async function oursAsItWas(): Promise<void> {
  expect(await readFile(join(folder, 'A'), 'utf8')).toBe(OURS_TEXT);
}

/** Whether this user may make symbolic links to files, which Windows allows only some. */
const CAN_LINK = await (async () => {
  const probe = await mkdtemp(join(tmpdir(), 'va-merge-link-'));
  try {
    await writeFile(join(probe, 'target'), '');
    await symlink(join(probe, 'target'), join(probe, 'link'), 'file');
    return true;
  } catch {
    return false;
  } finally {
    await rm(probe, { recursive: true, force: true });
  }
})();

describe('what the merge driver writes', () => {
  it('writes ours and nothing else, and leaves what the repository holds alone', async () => {
    // What a hostile repository could hold for a program that loads what it finds.
    await writeFile(join(folder, 'package.json'), '{"type":"commonjs","main":"evil.js"}');
    await writeFile(
      join(folder, 'tsconfig.json'),
      '{"compilerOptions":{"baseUrl":".","paths":{"@visual-anything/*":["./evil.js"]}}}',
    );
    await writeFile(join(folder, 'evil.js'), 'require("fs").writeFileSync("ran", "yes")');
    await mkdir(join(folder, 'node_modules', '@visual-anything', 'core'), { recursive: true });
    await writeFile(
      join(folder, 'node_modules', '@visual-anything', 'core', 'index.js'),
      'require("fs").writeFileSync("ran", "yes")',
    );
    await mkdir(join(folder, '.git', 'hooks'), { recursive: true });
    await writeFile(join(folder, '.git', 'hooks', 'post-merge'), '#!/bin/sh\ntouch ran\n');
    await writeFile(join(folder, '.git', 'config'), '[core]\n\tfsmonitor = touch ran\n');
    const before = await filesIn(folder);

    expect(await run(['O', 'A', 'B', 'model.vamodel', 'main', 'topic'])).toBe(0);

    const after = await filesIn(folder);
    expect([...after.keys()]).toEqual([...before.keys()]);
    for (const [path, bytes] of after) {
      if (path !== 'A') expect(bytes.equals(before.get(path)!), path).toBe(true);
    }
    expect(after.get('A')!.toString('utf8')).toBe(
      formatFile('model', { ...OURS, world: THEIRS.world }),
    );
  });

  it('never opens the path git names, which only says the kind', async () => {
    await writeFile(join(folder, 'model.vamodel'), 'not json at all');
    expect(await run(['O', 'A', 'B', 'model.vamodel'])).toBe(0);
    expect(await readFile(join(folder, 'model.vamodel'), 'utf8')).toBe('not json at all');
  });
});

describe('inputs that do not read', () => {
  const cases: [string, (args: string[]) => Promise<void>, RegExp][] = [
    [
      'ancestor',
      async () => writeFile(join(folder, 'O'), '{ not json'),
      /ancestor.*not valid JSON/i,
    ],
    [
      'theirs, not a model',
      async () => writeFile(join(folder, 'B'), '[]'),
      /theirs.*not a valid \.vamodel file/i,
    ],
    [
      'invalid UTF-8',
      async () => writeFile(join(folder, 'B'), Buffer.from([0x7b, 0xff, 0xfe, 0x7d])),
      /theirs.*not valid UTF-8/i,
    ],
    [
      'a model file of another kind',
      async () =>
        writeFile(
          join(folder, 'B'),
          formatFile('project', { schemaVersion: 1, name: 'P', packages: [] }),
        ),
      /theirs.*not a valid \.vamodel file/i,
    ],
    ['missing', async () => rm(join(folder, 'O')), /ancestor.*does not exist/i],
    [
      'a folder',
      async () => {
        await rm(join(folder, 'B'));
        await mkdir(join(folder, 'B'));
      },
      /theirs.*not a regular file/i,
    ],
  ];

  it.each(cases)('keeps ours for an input that is %s, and exits 1', async (_name, make, said) => {
    await make([]);
    expect(await run(['O', 'A', 'B', 'model.vamodel'])).toBe(1);
    await oursAsItWas();
    expect(err.join('\n')).toMatch(said);
    expect(err.join('\n')).toContain('git checkout --theirs -- model.vamodel');
  });

  it('keeps ours when ours itself does not read, writing nothing', async () => {
    await writeFile(join(folder, 'A'), '{"world": 1}');
    expect(await run(['O', 'A', 'B', 'model.vamodel'])).toBe(1);
    expect(await readFile(join(folder, 'A'), 'utf8')).toBe('{"world": 1}');
    expect(err.join('\n')).toMatch(/ours.*not a valid \.vamodel file/i);
  });

  it('refuses a project file of a newer format, saying so', async () => {
    const project = { schemaVersion: 1 as const, name: 'P', packages: [] };
    await writeFile(join(folder, 'O'), formatFile('project', project));
    await writeFile(join(folder, 'A'), formatFile('project', project));
    await writeFile(join(folder, 'B'), JSON.stringify({ ...project, schemaVersion: 99 }));
    expect(await run(['O', 'A', 'B', 'project.vaproject'])).toBe(1);
    expect(err.join('\n')).toMatch(/newer Visual Anything, format 99/);
  });

  it('refuses an input past its kind’s cap, before reading it', async () => {
    // A comment thread may hold at most 1 MiB.
    const thread = await readFile(
      join(EXAMPLES, 'my-systems', 'comments', 'reminder-timing.vacomment'),
      'utf8',
    );
    await writeFile(join(folder, 'O'), thread);
    await writeFile(join(folder, 'A'), thread);
    await writeFile(join(folder, 'B'), `${thread}${' '.repeat(1024 * 1024)}`);
    expect(await run(['O', 'A', 'B', 'comments/t.vacomment'])).toBe(1);
    expect(await readFile(join(folder, 'A'), 'utf8')).toBe(thread);
    expect(err.join('\n')).toMatch(/theirs.*holds more than 1 MiB/i);
  });

  it.skipIf(!CAN_LINK).each(['O', 'A', 'B'])(
    'refuses %s when it is a link, and never follows it',
    async (name) => {
      const outside = join(folder, 'outside.vamodel');
      await writeFile(outside, OURS_TEXT);
      await rm(join(folder, name));
      await symlink(outside, join(folder, name), 'file');
      expect(await run(['O', 'A', 'B', 'model.vamodel'])).toBe(1);
      expect(await readFile(outside, 'utf8')).toBe(OURS_TEXT);
      expect(err.join('\n')).toMatch(/is a link/);
    },
  );

  it('does not write a merged file past its kind’s cap, and keeps ours', async () => {
    // Each side adds 600 KB of comments to a thread, which may hold at most 1 MiB.
    const thread = parseFile(
      'comment',
      await readFile(join(EXAMPLES, 'my-systems', 'comments', 'reminder-timing.vacomment'), 'utf8'),
    );
    if (!thread.ok) throw new Error('The sample thread does not read.');
    const withComments = (side: string) => ({
      ...thread.value,
      comments: [
        ...thread.value.comments,
        ...Array.from({ length: 30 }, (_, i) => ({
          id: `${side}-${i}`,
          author: { kind: 'person' as const, name: side },
          time: '2026-10-26T09:30:00.000Z',
          text: side.repeat(20_000 / side.length),
        })),
      ],
    });
    const ours = formatFile('comment', withComments('ours'));
    await writeFile(join(folder, 'O'), formatFile('comment', thread.value));
    await writeFile(join(folder, 'A'), ours);
    await writeFile(join(folder, 'B'), formatFile('comment', withComments('them')));
    expect(await run(['O', 'A', 'B', 'comments/t.vacomment'])).toBe(1);
    expect(await readFile(join(folder, 'A'), 'utf8')).toBe(ours);
    expect(err.join('\n')).toMatch(/merged file would hold more than 1 MiB/);
  });

  it('refuses an input through a folder that leads outside the folder git runs it in', async () => {
    const outside = await mkdtemp(join(tmpdir(), 'va-merge-outside-'));
    try {
      await writeFile(join(outside, 'B'), formatFile('model', THEIRS));
      await symlink(outside, join(folder, 'away'), 'junction');
      expect(await run(['O', 'A', 'away/B', 'model.vamodel'])).toBe(1);
      await oursAsItWas();
      expect(err.join('\n')).toMatch(/theirs \(away\/B\) is a link, or lies outside/);
    } finally {
      await rm(join(folder, 'away'), { force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });
});

describe('paths', () => {
  it('merges nothing for a path of no project kind, keeping ours', async () => {
    expect(await run(['O', 'A', 'B', 'notes.json'])).toBe(1);
    await oursAsItWas();
    expect(err.join('\n')).toMatch(/notes\.json is not a project file/);
  });

  it('takes the kind from the extension alone, whatever the rest of the path holds', async () => {
    for (const path of [
      '-rf --global.vamodel',
      "it's $(touch ran) `touch ran`.vamodel",
      'views/../../../etc/passwd.vamodel',
      'C:\\Windows\\model.vamodel',
      'ünïcödé/模型.vamodel',
    ]) {
      await writeFile(join(folder, 'A'), OURS_TEXT);
      expect(await run(['O', 'A', 'B', path]), path).toBe(0);
    }
    expect((await filesIn(folder)).has('ran')).toBe(false);
  });

  it('escapes control characters of the path in what it says', async () => {
    expect(await run(['O', 'A', 'B', 'a\u001b[2J\nb.json'])).toBe(1);
    const said = err.join('\n');
    expect(said).not.toContain('\u001b');
    expect(said).toContain('a\\u{1b}[2J\\u{a}b.json');
  });

  it('reads names that look like options as files', async () => {
    await writeFile(join(folder, '--global'), formatFile('model', BASE));
    expect(await run(['--global', 'A', 'B', 'model.vamodel'])).toBe(2);
    expect(await run(['./--global', 'A', 'B', 'model.vamodel'])).toBe(0);
  });
});
