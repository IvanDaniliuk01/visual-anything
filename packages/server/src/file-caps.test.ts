/**
 * Whatever the local program writes, it can open again (CLAUDE.md, ADR 0058, ADR 0059). A project
 * file is read only within the cap of its kind, so a change that would write one past it is refused,
 * saying what to do instead, and nothing is written: the project still opens, and later changes are
 * still made, instead of every one being refused as changed on disk.
 *
 * The caps are shrunk here, kind by kind, so that random large text reaches them quickly; the last
 * tests keep the real ones.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Command, ProjectSnapshot } from '@visual-anything/core';
import type { FileKind } from '@visual-anything/schema';
import { untranslatedParts } from '@visual-anything/app/src/i18n/translate';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadProject } from './project';
import { capOf } from './regular-files';
import { openSession, type Session } from './session';
import { filesIn, testProject, writeProjectFolder } from './test-support';

/** The caps the test sets, by kind; a kind left out keeps its real cap. */
const caps = vi.hoisted(() => new Map<string, number>());

vi.mock('./regular-files', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./regular-files')>();
  return {
    ...actual,
    capOf: (kind: FileKind) => caps.get(kind) ?? actual.capOf(kind),
  };
});

const ANA = { kind: 'person', name: 'Ana', email: 'ana@example.com' } as const;

/** The test project with a tour and a thread, so that every kind of file is there to grow. */
function project(): ProjectSnapshot {
  return {
    ...testProject(),
    tours: [
      {
        id: 'walk',
        name: 'A walk',
        steps: [{ id: 'start', viewState: { view: 'overview' }, caption: { title: 'The shop' } }],
      },
    ],
    comments: [
      {
        id: 'why',
        anchor: { kind: 'element', element: 'api' },
        comments: [{ id: 'first', author: ANA, time: '2026-10-25T14:03:00.000Z', text: 'Why?' }],
      },
    ],
  };
}

/** For each kind of file: the file the test grows, and a change that sets a text in it. */
const GROWN: Record<FileKind, { path: string; set: (text: string) => Command }> = {
  project: {
    path: 'project.vaproject',
    set: (text) => ({ type: 'update-project', changes: { description: text } }),
  },
  model: {
    path: 'model.vamodel',
    set: (text) => ({ type: 'update-element', id: 'api', changes: { description: text } }),
  },
  package: {
    path: 'packages/shop.vapackage',
    set: (text) => ({ type: 'update-component', id: 'shop.cart', changes: { description: text } }),
  },
  view: {
    path: 'views/overview.vaview',
    set: (text) => ({ type: 'update-view', id: 'overview', changes: { description: text } }),
  },
  scenario: {
    path: 'scenarios/request.vascenario',
    set: (text) => ({ type: 'update-scenario', id: 'request', changes: { description: text } }),
  },
  tour: {
    path: 'tours/walk.vatour',
    set: (text) => ({
      type: 'update-tour',
      id: 'walk',
      changes: {
        steps: [
          {
            id: 'start',
            viewState: { view: 'overview' },
            caption: { title: 'The shop' },
            notes: text,
          },
        ],
      },
    }),
  },
  comment: {
    path: 'comments/why.vacomment',
    set: (text) => ({ type: 'edit-comment', thread: 'why', comment: 'first', text, author: ANA }),
  },
};

const KINDS = Object.keys(GROWN) as FileKind[];

/** The kind of a project file, by its extension. */
function kindOf(path: string): FileKind {
  const extension = path.slice(path.lastIndexOf('.'));
  const kinds: Record<string, FileKind> = {
    '.vaproject': 'project',
    '.vamodel': 'model',
    '.vapackage': 'package',
    '.vaview': 'view',
    '.vascenario': 'scenario',
    '.vatour': 'tour',
    '.vacomment': 'comment',
  };
  const kind = kinds[extension];
  if (kind === undefined) throw new Error(`${path} is no project file.`);
  return kind;
}

/**
 * Text that takes from one to six bytes a character in a file: letters, characters that JSON escapes,
 * characters of two, three and four bytes in UTF-8, and a lone surrogate, which JSON writes as `\ud800`.
 */
const TEXT = fc.string({
  unit: fc.constantFrom('a', ' ', '"', '\\', '\n', '\t', 'é', '語', '😀', '\ud800'),
  minLength: 1,
  maxLength: 1500,
  size: 'max',
});

/** Refusals that would mean the program wrote what it cannot read back. */
const NEVER = new Set(['changed-on-disk', 'not-saved', 'program-failed']);

let folder: string | undefined;
let session: Session | undefined;

afterEach(async () => {
  caps.clear();
  await session?.close();
  session = undefined;
  if (folder !== undefined) await rm(folder, { recursive: true, force: true, maxRetries: 10 });
  folder = undefined;
});

/** Opens a session on the project in a new folder. */
async function open(snapshot: ProjectSnapshot = project()): Promise<Session> {
  folder = await mkdtemp(join(tmpdir(), 'va-caps-'));
  await writeProjectFolder(folder, snapshot);
  let made = 0;
  const result = await openSession(folder, {
    watch: false,
    out: () => {},
    err: () => {},
    now: () => Date.UTC(2026, 9, 26, 9, 0),
    newId: (base) => `${base}-${(made += 1)}`,
  });
  if (!result.ok) throw new Error(`The project does not open: ${JSON.stringify(result.errors)}`);
  session = result.session;
  return result.session;
}

/** Every project file in the folder is within its cap. */
async function expectWithinCaps(where: string): Promise<void> {
  for (const [path, bytes] of await filesIn(where)) {
    expect(bytes.length, path).toBeLessThanOrEqual(capOf(kindOf(path)));
  }
}

describe('what the program writes always opens again', () => {
  it.each(KINDS)(
    'for a %s file: a change past its cap is refused, saying what to do, and the project still opens',
    async (kind) => {
      const grown = GROWN[kind];
      // The cap: what the file holds now, and room for a few hundred characters more.
      const base = project();
      const probe = await mkdtemp(join(tmpdir(), 'va-caps-probe-'));
      await writeProjectFolder(probe, base);
      const size = (await filesIn(probe)).get(grown.path)?.length ?? 0;
      await rm(probe, { recursive: true, force: true, maxRetries: 10 });
      expect(size).toBeGreaterThan(0);
      caps.set(kind, size + 1200);
      const program = await open(base);
      const where = folder as string;

      // Over the runs, some changes are made and some refused, so that both ways are tried.
      let saved = 0;
      let refused = 0;
      await fc.assert(
        fc.asyncProperty(fc.array(TEXT, { minLength: 1, maxLength: 3 }), async (texts) => {
          for (const text of texts) {
            const outcome = await program.execute(grown.set(text), 'user');
            if (outcome.ok) saved += 1;
            else {
              for (const problem of outcome.problems) {
                expect(NEVER.has(problem.code), problem.message).toBe(false);
                if (problem.code !== 'invalid-file') continue;
                refused += 1;
                expect(problem.message.startsWith(`${grown.path} would hold more than `)).toBe(
                  true,
                );
                if (kind === 'comment') expect(problem.message).toMatch(/start another thread\.$/);
                if (kind === 'tour') expect(problem.message).toMatch(/in another tour\.$/);
                // The app reads it in Spanish.
                expect(untranslatedParts('es', problem.message)).toEqual([]);
              }
            }
            await expectWithinCaps(where);
          }
          // The folder opens as the program holds it, and a small change is still made.
          const loaded = await loadProject(where);
          expect(loaded.ok).toBe(true);
          if (loaded.ok) expect(loaded.project).toEqual(program.snapshot);
          expect((await program.execute(grown.set('Short.'), 'user')).ok).toBe(true);
        }),
        { numRuns: 10 },
      );
      expect(saved).toBeGreaterThan(0);
      expect(refused).toBeGreaterThan(0);
    },
    120_000,
  );
});

describe('a thread at the real cap', () => {
  it('is refused past 200,000 characters by the core, before its file could pass 1 MiB', async () => {
    const program = await open();
    const long = '語'.repeat(20_000);
    let added = 0;
    for (;;) {
      const outcome = await program.execute(
        { type: 'add-comment', thread: 'why', comment: { text: long, author: ANA } },
        'user',
      );
      if (!outcome.ok) {
        expect(outcome.problems.map((each) => each.code)).toEqual(['invalid-comment']);
        expect(outcome.problems[0]?.message).toMatch(/start another thread\.$/);
        break;
      }
      added += 1;
    }
    expect(added).toBe(9);
    await expectWithinCaps(folder as string);
    expect((await loadProject(folder as string)).ok).toBe(true);
    expect(
      (await program.execute({ type: 'resolve-thread', thread: 'why', resolved: true }, 'user')).ok,
    ).toBe(true);
  }, 60_000);

  it('is refused by the program when its file would pass 1 MiB first, and the project still opens', async () => {
    const program = await open();
    // A lone surrogate is one character, which JSON writes in six bytes.
    const heavy = '\ud800'.repeat(20_000);
    const said: string[] = [];
    for (let at = 0; at < 9; at += 1) {
      const outcome = await program.execute(
        { type: 'add-comment', thread: 'why', comment: { text: heavy, author: ANA } },
        'user',
      );
      if (!outcome.ok) said.push(...outcome.problems.map((each) => each.message));
    }
    expect(said).toEqual([
      'comments/why.vacomment would hold more than 1 MiB, the most a thread may hold in its file, so this change was not made: start another thread.',
    ]);
    expect(program.snapshot.comments[0]?.comments).toHaveLength(9);
    await expectWithinCaps(folder as string);
    expect((await loadProject(folder as string)).ok).toBe(true);
    // Later changes are made, rather than refused as changed on disk.
    const answered = await program.execute(
      { type: 'add-comment', thread: 'why', comment: { text: 'Short.', author: ANA } },
      'user',
    );
    expect(answered.ok).toBe(true);
    expect((await loadProject(folder as string)).ok).toBe(true);
  }, 60_000);
});
