/**
 * The local program's messages to the app, in Spanish (ADR-0038): the notices it sends when the files
 * of the open project change on disk and are not valid, the warnings of a project, its refusals and
 * every problem that keeps a project from opening. The program writes English; the app reads each
 * through its catalog's templates, so each one here must read in Spanish there, but for the reasons
 * that come from outside, such as the JSON parser's, which stay as they are.
 */
import * as fsp from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { ViewFile } from '@visual-anything/schema';
import { formatFile } from '@visual-anything/schema/format';
import { translateMessage, untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { formatProjectProblem, loadProject } from './project';
import { openSession, type Session, type SessionOptions } from './session';
import { FakeClient, testProject, writeProjectFolder, writeText } from './test-support';
import type { WriterFs } from './writer';

const RENAME_API: Command = { type: 'update-element', id: 'api', changes: { name: 'Gateway' } };

let folder: string;
const opened: Session[] = [];

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'va-spanish-'));
});

afterEach(async () => {
  for (const session of opened.splice(0)) await session.close();
  await rm(folder, { recursive: true, force: true, maxRetries: 10 });
});

async function open(options: SessionOptions = {}): Promise<Session> {
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    ...options,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  opened.push(result.session);
  return result.session;
}

/** What a message leaves in English once the app reads it in Spanish. */
function inEnglish(message: string): string[] {
  return untranslatedParts('es', message);
}

/** The problems that keep the project in the test folder from opening, as the notices write them. */
async function problemsOf(snapshot: ProjectSnapshot, files: Record<string, string>) {
  await writeProjectFolder(folder, snapshot);
  for (const [path, text] of Object.entries(files)) await writeText(folder, path, text);
  const loaded = await loadProject(folder);
  expect(loaded.ok).toBe(false);
  return loaded.ok ? [] : loaded.errors.map(formatProjectProblem);
}

describe('what the local program tells the app', () => {
  it('reads a project whose files changed on disk and are not valid now', async () => {
    await writeProjectFolder(folder, testProject());
    const session = await open();
    const client = new FakeClient();
    session.connect(client);

    await writeText(folder, 'model.vamodel', '{ "world": ');
    const refused = await session.execute(RENAME_API, 'user');
    await session.idle();

    expect(refused.ok).toBe(false);
    const said = [
      ...(refused.ok ? [] : refused.problems.map((problem) => problem.message)),
      ...client.ofType('notice').map((notice) => notice.message),
    ];
    expect(said).toHaveLength(2);
    expect(said[1]).toMatch(/changed on disk, but the project is not valid now/);
    expect(said.flatMap(inEnglish)).toEqual([]);
    expect(translateMessage('es', said[0] as string)).toBe(
      'Hubo cambios en el disco en model.vamodel, así que este cambio no se hizo; el proyecto se vuelve a cargar desde los archivos.',
    );
  });

  it('reads the warnings of a project as it opens', async () => {
    const state = testProject();
    await writeProjectFolder(folder, {
      ...state,
      model: {
        ...state.model,
        relations: [
          ...state.model.relations,
          {
            id: 'api-reads-customer',
            relationType: 'systems.reads-from',
            from: 'api',
            to: 'customer',
          },
        ],
      },
    });
    const session = await open();
    const client = new FakeClient();
    session.connect(client);

    const [notice] = client.ofType('notice');
    expect(notice?.message).toMatch(/^The project has 1 warning:\n/);
    expect(inEnglish(notice?.message ?? '')).toEqual([]);
  });

  it('reads why a change could not be saved, and why there is nothing to undo', async () => {
    await writeProjectFolder(folder, testProject());
    const failing: WriterFs = {
      open: () => Promise.reject(Object.assign(new Error('ENOSPC: simulated'), { code: 'ENOSPC' })),
      rename: (from, to) => fsp.rename(from, to),
      unlink: (path) => fsp.unlink(path),
      mkdir: (path, options) => fsp.mkdir(path, options),
    };
    const session = await open({ writer: { fs: failing } });

    const saved = await session.execute(RENAME_API, 'user');
    const undone = await session.undo();

    const said = [saved, undone].flatMap((outcome) =>
      outcome.ok ? [] : outcome.problems.map((problem) => problem.message),
    );
    expect(said).toHaveLength(2);
    expect([...said, `Could not undo: ${said[1]}`].flatMap(inEnglish)).toEqual([]);
  });
});

describe('the problems that keep a project from opening', () => {
  it('reads files that are not JSON, or not of their kind', async () => {
    const problems = await problemsOf(testProject(), {
      'model.vamodel': '{ "world": ',
      'views/overview.vaview': JSON.stringify({ id: 'overview', zoom: 2 }),
      'scenarios/request.vascenario': JSON.stringify({ schemaVersion: 2 }),
    });
    expect(problems.length).toBeGreaterThan(3);
    expect(problems.flatMap(inEnglish)).toEqual([]);
  });

  it('reads files of a kind that are not valid, item by item', async () => {
    const state = testProject();
    const problems = await problemsOf(state, {
      'project.vaproject': formatFile('project', {
        ...state.project,
        name: '',
        packages: ['systems', 'systems', 'Not an id'],
      }),
      'packages/shop.vapackage': JSON.stringify({
        id: 'shop',
        name: 'Shop',
        components: [
          {
            id: 'shop.cart',
            name: 'Cart',
            derivesFrom: 'systems.box',
            appearance: { fill: 'pink', width: -1, shape: 'star', detail: { badges: [] } },
            attributes: [{ name: 'items', type: 'count' }],
          },
        ],
        relationTypes: 'none',
      }),
    });
    expect(problems.length).toBeGreaterThan(4);
    expect(problems.flatMap(inEnglish)).toEqual([]);
  });

  it('reads a folder that holds no project, or two', async () => {
    const twice = await problemsOf(testProject(), {
      'other.vaproject': formatFile('project', testProject().project),
    });
    await rm(join(folder, 'model.vamodel'));
    const without = await loadProject(folder);
    const problems = [...twice, ...(without.ok ? [] : without.errors.map(formatProjectProblem))];
    expect(problems.length).toBeGreaterThan(1);
    expect(problems.flatMap(inEnglish)).toEqual([]);
  });

  it('reads packages listed but missing, ids used twice and ids kept for built-in packages', async () => {
    const state = testProject();
    const problems = await problemsOf(
      { ...state, project: { ...state.project, packages: ['systems', 'shop', 'gone'] } },
      {
        'packages/systems.vapackage': formatFile('package', {
          id: 'systems',
          name: 'Mine',
          components: [],
          relationTypes: [],
        }),
        // A second file of the view whose id the first one has.
        'views/again.vaview': formatFile('view', state.views[0] as ViewFile),
      },
    );
    expect(problems.length).toBeGreaterThan(2);
    expect(problems.flatMap(inEnglish)).toEqual([]);
  });

  it('reads a folder of views that is a file', async () => {
    const state = testProject();
    await writeProjectFolder(folder, { ...state, views: [], scenarios: [] });
    await writeText(folder, 'views', 'not a folder');
    const loaded = await loadProject(folder);
    const problems = loaded.ok ? [] : loaded.errors.map(formatProjectProblem);
    expect(problems).toHaveLength(1);
    expect(problems.flatMap(inEnglish)).toEqual([]);
  });

  it('reads a model whose relations end on nothing, and files that are not UTF-8', async () => {
    const state = testProject();
    const problems = await problemsOf(
      {
        ...state,
        model: {
          ...state.model,
          relations: [
            ...state.model.relations,
            { id: 'stray', relationType: 'systems.reads-from', from: 'api', to: 'nowhere' },
          ],
        },
      },
      {},
    );
    await writeProjectFolder(folder, state);
    await fsp.writeFile(join(folder, 'views', 'overview.vaview'), Buffer.from([0xff, 0xfe, 0x7b]));
    const loaded = await loadProject(folder);
    const more = loaded.ok ? [] : loaded.errors.map(formatProjectProblem);
    expect([...problems, ...more].length).toBeGreaterThan(1);
    expect([...problems, ...more].flatMap(inEnglish)).toEqual([]);
  });
});
