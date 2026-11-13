/**
 * Explorables in packages shared between projects (ADR 0051, ADR 0107, A10's review): `add-package`
 * and `replace-package` carry a package's explorables and script libraries, checked as defining them
 * one by one checks them; the texts live beside the project, so one the project lacks shows its card
 * "its file is missing"; an update keeps the texts the project holds and refuses to drop what still
 * shows; and a package that goes takes its explorables' texts with it, undoably.
 */
import type {
  ExplorableDefinition,
  PackageFile,
  ScriptLibraryDefinition,
} from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { checkProject } from '../check';
import { executeCommand, type Command, type CommandOutcome } from '../commands';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds, testProject } from '../test/fixtures';
import { explorableCard, explorableTextHash, explorableTextOf, explorablesIn } from './index';

const PAGE = '<!doctype html><p>y = x²</p><script>va.ready()</script>';
const OTHER = '<!doctype html><p>y = x³</p>';

function run(state: ProjectSnapshot, command: Command): CommandOutcome {
  return executeCommand(state, command, { newId: sequentialIds(), author: 'user' });
}

/** Runs a command that must be done, and checks that undoing it gives the project back exactly. */
function ok(state: ProjectSnapshot, command: Command) {
  const outcome = run(state, command);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(state: ProjectSnapshot, command: Command): string[] {
  const outcome = run(state, command);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

function library(id = 'math.d3'): ScriptLibraryDefinition {
  return {
    id,
    npm: 'd3',
    version: '7.9.0',
    tarball: 'https://registry.npmjs.org/d3/-/d3-7.9.0.tgz',
    integrity: `sha512-${'A'.repeat(86)}==`,
    path: 'dist/d3.min.js',
    license: 'ISC',
    global: 'd3',
    hash: 'a'.repeat(64),
    bytes: 1000,
  };
}

function explorable(
  id = 'math.parabola',
  more: Partial<ExplorableDefinition> = {},
): ExplorableDefinition {
  return {
    id,
    name: 'Parabola',
    file: 'parabola.html',
    scriptLibraries: ['math.d3'],
    parameters: [{ name: 'a', kind: 'number', min: -5, max: 5, default: 1 }],
    api: 1,
    hash: explorableTextHash(PAGE),
    ...more,
  };
}

/** A package from another project, with an explorable and the script library it uses. */
const MATH: PackageFile = {
  id: 'math',
  name: 'Math',
  components: [{ id: 'math.function', name: 'Function', derivesFrom: 'essence' }],
  relationTypes: [],
  explorables: [explorable()],
  scriptLibraries: [library()],
};

const add = (file: PackageFile = MATH): Command => ({ type: 'add-package', package: file });
const replace = (file: PackageFile): Command => ({ type: 'replace-package', package: file });
const stored = (state: ProjectSnapshot) => state.packages.find((each) => each.id === 'math');

/** The project with Math added and its explorable's text read from beside the project. */
function withMath(text = PAGE): ProjectSnapshot {
  const added = ok(testProject(), add()).state;
  const read = executeCommand(
    added,
    { type: 'record-explorable-file', id: 'math.parabola', text },
    { newId: sequentialIds(), author: 'user', program: true },
  );
  if (!read.ok) throw new Error(read.problems.map((each) => each.message).join(' '));
  return read.state;
}

describe('add-package carries explorables and script libraries', () => {
  it('stores their definitions, as one undoable action; an explorable with no text shows why', () => {
    const outcome = ok(testProject(), add());
    expect(stored(outcome.state)).toEqual(MATH);
    expect(outcome.created).toEqual(['math']);
    expect(explorableTextOf(outcome.state, 'math.parabola')).toBeUndefined();
    expect(explorableCard(outcome.state, 'math.parabola').reason).toBe('no-text');
    expect(checkProject(outcome.state).errors).toEqual([]);
  });

  it('refuses what defining them one by one refuses', () => {
    const state = testProject();
    const withExplorables = (explorables: unknown[], more: Partial<PackageFile> = {}) =>
      add({ ...MATH, ...more, explorables: explorables as ExplorableDefinition[] });
    // A script library the package does not define.
    expect(refused(state, withExplorables([explorable()], { scriptLibraries: undefined }))).toEqual(
      ['unknown-script-library'],
    );
    // Another version of the va API, a hash that is not one, a key it does not have.
    expect(refused(state, withExplorables([{ ...explorable(), api: 2 }]))).toEqual([
      'invalid-explorable',
    ]);
    expect(refused(state, withExplorables([{ ...explorable(), hash: 'x' }]))).toEqual([
      'invalid-explorable',
    ]);
    expect(refused(state, withExplorables([{ ...explorable(), code: [] }]))).toEqual([
      'invalid-explorable',
    ]);
    // An id outside the package, an id used twice, two explorables in one file.
    expect(refused(state, withExplorables([explorable('other.parabola')]))).toEqual([
      'id-outside-package',
    ]);
    expect(refused(state, withExplorables([explorable(), explorable()]))).toEqual([
      'defined-twice',
    ]);
    expect(
      refused(state, withExplorables([explorable(), explorable('math.cubic', { name: 'Cubic' })])),
    ).toEqual(['id-taken']);
    // A script library that is not one.
    expect(
      refused(
        state,
        add({ ...MATH, scriptLibraries: [{ ...library(), tarball: 'https://x.org/' }] }),
      ),
    ).toEqual(['invalid-script-library']);
  });

  it('refuses an explorable whose file or id another package of the project takes', () => {
    const state = ok(testProject(), {
      type: 'define-explorable',
      package: 'test',
      explorable: { id: 'test.parabola', name: 'Parabola', file: 'parabola.html' },
      text: PAGE,
    }).state;
    expect(refused(state, add())).toEqual(['id-taken']);
    const elsewhere = add({
      ...MATH,
      id: 'test2',
      components: [],
      explorables: [explorable('test2.parabola', { scriptLibraries: undefined, file: 'p.html' })],
      scriptLibraries: undefined,
    });
    expect(run(state, elsewhere).ok).toBe(true);
  });
});

describe('replace-package keeps the texts beside the project', () => {
  it('keeps an explorable’s text and file, and takes the text’s hash over the file’s', () => {
    const before = withMath();
    const outcome = ok(
      before,
      replace({
        ...MATH,
        explorables: [
          explorable('math.parabola', {
            name: 'Parabola, again',
            file: 'renamed.html',
            hash: explorableTextHash(OTHER),
          }),
        ],
      }),
    );
    const definition = explorablesIn(outcome.state).explorable('math.parabola')?.definition;
    expect(definition).toMatchObject({
      name: 'Parabola, again',
      file: 'parabola.html',
      hash: explorableTextHash(PAGE),
    });
    expect(explorableTextOf(outcome.state, 'math.parabola')?.text).toBe(PAGE);
  });

  it('drops an explorable nothing shows with its text, and undo gives both back', () => {
    const before = withMath();
    const outcome = ok(before, replace({ ...MATH, explorables: undefined }));
    expect(stored(outcome.state)?.explorables).toBeUndefined();
    expect(explorableTextOf(outcome.state, 'math.parabola')).toBeUndefined();
  });

  it('refuses to drop an explorable something shows, or a script library it uses', () => {
    const shown = ok(withMath(), {
      type: 'update-element',
      id: 'api',
      changes: { appearance: { explorable: { explorable: 'math.parabola' } } },
    }).state;
    const dropped = run(shown, replace({ ...MATH, explorables: undefined }));
    expect(dropped.ok ? [] : dropped.problems.map((each) => each.message)).toEqual([
      expect.stringContaining('removes the explorable "Parabola"'),
    ]);
    expect(refused(shown, replace({ ...MATH, scriptLibraries: undefined }))).toEqual([
      'unknown-script-library',
    ]);
  });
});

describe('a package that goes', () => {
  it('takes its explorables’ texts with it, and undo gives them back', () => {
    const before = withMath();
    const packages = before.project.packages.filter((each) => each !== 'math');
    const outcome = ok(before, { type: 'update-project', changes: { packages } });
    expect(stored(outcome.state)).toBeUndefined();
    expect(outcome.state.explorableTexts).toBeUndefined();
  });
});
