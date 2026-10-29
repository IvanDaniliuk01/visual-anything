/**
 * A real `git merge` of two branches of a sample (ADR 0072), with the driver given only through `-c`
 * on that git call, never through anyone's configuration: independent changes join, and what clashes
 * stays as conflicts in a file that still validates. The repository is hostile besides: what it holds
 * for a program that loads what it finds never runs.
 */
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FileContentByKind, FileKind } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { parseFile } from '@visual-anything/schema/validate';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  git,
  gitHome,
  gitStatus,
  NO_GIT,
  programFromSources,
  removeFolder,
  type GitHome,
} from './merge-driver-git-support';
import { ATTRIBUTE_LINES, DRIVER_KEYS, driverCommand } from './merge-driver';
import { EXAMPLES } from './samples-source';
import { filesIn } from './test-support';
import { atLeast, parseGitVersion } from './versions/git';

let home: GitHome;
let repository: string;

async function read<K extends FileKind>(kind: K, path: string): Promise<FileContentByKind[K]> {
  const parsed = parseFile(kind, await readFile(join(repository, path), 'utf8'));
  if (!parsed.ok) throw new Error(`${path} does not validate: ${JSON.stringify(parsed.errors)}`);
  return parsed.value;
}

async function edit<K extends FileKind>(
  kind: K,
  path: string,
  change: (file: FileContentByKind[K]) => void,
): Promise<void> {
  const file = await read(kind, path);
  change(file);
  await writeFile(join(repository, path), formatFile(kind, file));
}

const MODEL = 'model.vamodel';
const VIEW = 'views/system-overview.vaview';
const TOUR = 'tours/how-booking-works.vatour';

describe.skipIf(NO_GIT)('a real git merge with the merge driver', () => {
  let merge: { status: number | null; stdout: string; stderr: string };

  beforeAll(async () => {
    home = await gitHome();
    repository = join(home.home, 'repository');
    await cp(join(EXAMPLES, 'my-systems'), repository, { recursive: true });
    await writeFile(join(repository, '.gitattributes'), `${ATTRIBUTE_LINES.join('\n')}\n`);
    // What a hostile repository holds for a program that loads what it finds: none of it may run.
    const evil =
      'require("node:fs").writeFileSync(require("node:path").join(process.cwd(), "ran"), "yes");';
    await writeFile(join(repository, 'evil.cjs'), evil);
    await writeFile(join(repository, 'package.json'), '{"type":"commonjs","main":"evil.cjs"}');
    await writeFile(
      join(repository, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          baseUrl: '.',
          paths: { '@visual-anything/*': ['./evil.cjs'], tsx: ['./evil.cjs'] },
        },
      }),
    );
    for (const name of ['core', 'schema']) {
      const folder = join(repository, 'node_modules', '@visual-anything', name);
      await mkdir(folder, { recursive: true });
      await writeFile(join(folder, 'package.json'), '{"main":"index.js"}');
      await writeFile(join(folder, 'index.js'), evil);
    }
    git(home, home.home, 'init', '-q', repository);
    git(home, repository, 'add', '-A');
    git(home, repository, 'commit', '-q', '-m', 'The sample');

    git(home, repository, 'checkout', '-q', '-b', 'feature/billing');
    await edit('model', MODEL, (file) => {
      file.elements.push({ id: 'billing', component: 'systems.system', name: 'Billing' });
      file.elements[1]!.name = 'Booking, as billing calls it';
    });
    await edit('view', VIEW, (file) => {
      file.positions[0]!.x += 40;
    });
    await edit('tour', TOUR, (file) => {
      file.description = 'Theirs describes the tour.';
    });
    git(home, repository, 'commit', '-q', '-am', 'Billing');

    git(home, repository, 'checkout', '-q', 'main');
    await edit('model', MODEL, (file) => {
      file.elements[0]!.description = 'Ours describes the patient.';
      file.elements[1]!.name = 'Booking, as the clinic calls it';
    });
    await edit('view', VIEW, (file) => {
      file.name = 'Our overview';
    });
    git(home, repository, 'commit', '-q', '-am', 'Clinic');

    const command = driverCommand(programFromSources());
    if (!command.ok) throw new Error(command.why);
    merge = gitStatus(
      home,
      repository,
      '-c',
      `${DRIVER_KEYS.name}=Visual Anything`,
      '-c',
      `${DRIVER_KEYS.driver}=${command.command}`,
      'merge',
      '--no-edit',
      'feature/billing',
    );
  }, 300_000);

  afterAll(async () => {
    if (home !== undefined) await removeFolder(home.home);
  });

  it('stops with what clashes, and only that file unmerged', () => {
    expect(merge.status, merge.stderr + merge.stdout).toBe(1);
    expect(merge.stdout).toMatch(/CONFLICT \(content\): Merge conflict in model\.vamodel/);
    const unmerged = git(home, repository, 'diff', '--name-only', '--diff-filter=U').trim();
    expect(unmerged).toBe(MODEL);
  });

  it('joins the independent changes, and keeps the clash as a conflict in a file that validates', async () => {
    const model = await read('model', MODEL);
    expect(model.elements.map((each) => each.id)).toContain('billing');
    expect(model.elements[0]!.description).toBe('Ours describes the patient.');
    expect(model.elements[1]!.name).toBe('Booking, as the clinic calls it');
    const version = parseGitVersion(git(home, repository, 'version').trim());
    const named = version !== undefined && atLeast(version, { major: 2, minor: 44 });
    expect(model.conflicts).toEqual([
      {
        id: 'conflict-1',
        item: `element:${model.elements[1]!.id}`,
        path: ['name'],
        why: 'both-changed',
        kept: 'ours',
        other: 'Booking, as billing calls it',
        base: 'Clinic booking',
        ...(named ? { sides: { ours: 'HEAD', theirs: 'feature/billing' } } : {}),
      },
    ]);
    expect(merge.stderr).toMatch(/merged model\.vamodel by id, and 1 conflict remains in it/);
  });

  it('merges a file that both sides changed apart without a conflict', async () => {
    const view = await read('view', VIEW);
    expect(view.name).toBe('Our overview');
    expect(view.conflicts).toBeUndefined();
    expect((await read('tour', TOUR)).description).toBe('Theirs describes the tour.');
  });

  it('writes no conflict markers, and nothing the repository held ran', async () => {
    const files = await filesIn(repository);
    for (const [path, bytes] of files) {
      if (path.startsWith('.git/')) continue;
      expect(bytes.toString('utf8'), path).not.toMatch(/^<<<<<<< /m);
    }
    expect(files.has('ran')).toBe(false);
    expect(
      [...files.keys()].filter((path) => !path.startsWith('.git/') && path.includes('merge_file')),
    ).toEqual([]);
  });

  it('never wrote the driver into any configuration', async () => {
    await expect(readFile(home.globalConfig, 'utf8')).rejects.toThrow();
    expect(await readFile(join(repository, '.git', 'config'), 'utf8')).not.toContain(
      'visual-anything',
    );
  });
});
