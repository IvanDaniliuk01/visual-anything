/**
 * Packages shared between projects (ADR 0051) keep what their files hold beyond definitions and
 * images (ADR 0089's M14.3 clarification): their code, its capabilities and what it adds to the app,
 * their solids and their crosswalks. `add-package` and `replace-package` store them as the file holds
 * them, checked as the commands that write each one check it; the code's hash then changes with them,
 * so code that changed asks for the person's approval again.
 */
import type { PackageFile, SolidDefinition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { packageCodeOf } from './code/packages';
import { executeCommand, type Command } from './commands';
import { applyOperations } from './operations';
import { readSolid } from './solids';
import type { ProjectSnapshot } from './snapshot';
import { sequentialIds, testProject } from './test/fixtures';
import { boxMesh, writeTestSolid } from './test/solids';

function run(command: Command, state: ProjectSnapshot) {
  return executeCommand(state, command, { newId: sequentialIds() });
}

/** Runs a command that must be done, and checks that undoing it gives the project back exactly. */
function ok(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (!outcome.ok) {
    throw new Error(`Rejected: ${outcome.problems.map((each) => each.message).join(' ')}`);
  }
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(state);
  return outcome;
}

function refused(command: Command, state: ProjectSnapshot = testProject()) {
  const outcome = run(command, state);
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems;
}

function solid(id: string, size = 0.5): SolidDefinition {
  const reading = readSolid(
    writeTestSolid({
      nodes: [{ name: 'body', mesh: 0 }],
      meshes: [boxMesh([0, 0, 0], [size, size, size])],
    }),
  );
  if (!reading.ok) throw new Error('The solid does not read.');
  const { bounds, counts, parts } = reading.description;
  return {
    id,
    name: 'Till',
    hash: reading.hash,
    bytes: reading.bytes,
    bounds,
    counts,
    parts,
    camera: { azimuth: 30, elevation: 20 },
  };
}

const PLAIN: PackageFile = {
  id: 'shop',
  name: 'Shop',
  version: '1.0.0',
  components: [{ id: 'shop.store', name: 'Store', derivesFrom: 'essence' }],
  relationTypes: [],
};

/** Shop with code that adds an action, a crosswalk and a solid. */
const CODED: PackageFile = {
  ...PLAIN,
  version: '1.1.0',
  crosswalks: [{ from: 'uberon', to: 'fma', entries: { 'UBERON:0002135': 'FMA:7235' } }],
  solids: [solid('shop.till')],
  code: ['export function act() {', '  return { commands: [] };', '}'],
  capabilities: ['model:read'],
  extensions: {
    actions: [{ id: 'tidy', label: 'Tidy the shop', where: ['packages-menu'] }],
  },
};

const add = (file: PackageFile): Command => ({ type: 'add-package', package: file });
const replace = (file: PackageFile): Command => ({ type: 'replace-package', package: file });
const stored = (state: ProjectSnapshot) => state.packages.find((each) => each.id === 'shop');

describe('replace-package keeps what the new file holds', () => {
  it('stores its code, capabilities, extensions, solids and crosswalks, as one undoable action', () => {
    const before = ok(add(PLAIN)).state;
    const outcome = ok(replace(CODED), before);
    expect(outcome.label).toBe('Update the package "Shop"');
    expect(stored(outcome.state)).toEqual(CODED);
    expect(outcome.created).toEqual(['shop.till']);
  });

  it('changes the hash the code is approved by when the code changes, so it asks again', () => {
    const before = ok(replace(CODED), ok(add(PLAIN)).state).state;
    const changed: PackageFile = { ...CODED, code: ['export function act() {}'] };
    const outcome = ok(replace(changed), before);
    const was = packageCodeOf(stored(before)!)?.hash;
    const now = packageCodeOf(stored(outcome.state)!)?.hash;
    expect(was).toBeDefined();
    expect(now).toBeDefined();
    expect(now).not.toBe(was);
    // What the code adds is part of the hash too.
    const more = ok(
      replace({
        ...changed,
        extensions: { actions: [{ id: 'tidy', label: 'Tidy it', where: ['selection'] }] },
      }),
      outcome.state,
    );
    expect(packageCodeOf(stored(more.state)!)?.hash).not.toBe(now);
  });

  it('keeps the hash, and records nothing, when the file holds the same', () => {
    const before = ok(replace(CODED), ok(add(PLAIN)).state).state;
    const outcome = ok(replace(CODED), before);
    expect(outcome.operations).toEqual([]);
  });

  it('removes what the new file leaves out, the code with its capabilities included', () => {
    const before = ok(replace(CODED), ok(add(PLAIN)).state).state;
    const outcome = ok(replace(PLAIN), before);
    expect(stored(outcome.state)).toEqual(PLAIN);
  });

  it('takes the code as text or as its lines', () => {
    const before = ok(add(PLAIN)).state;
    const outcome = ok(
      replace({
        ...CODED,
        code: 'export function act() {\n  return { commands: [] };\n}\n' as never,
      }),
      before,
    );
    expect(stored(outcome.state)?.code).toEqual(CODED.code);
  });

  it('checks the code, its capabilities and what it adds as set-package-code does', () => {
    const before = ok(add(PLAIN)).state;
    expect(refused(replace({ ...PLAIN, capabilities: ['model:read'] }), before)).toEqual([
      expect.objectContaining({
        code: 'invalid-code',
        message: 'The package "Shop" has no code to give capabilities to.',
      }),
    ]);
    expect(refused(replace({ ...PLAIN, extensions: CODED.extensions }), before)).toEqual([
      expect.objectContaining({
        code: 'invalid-code',
        message: 'The package "Shop" has no code to add anything to the app.',
      }),
    ]);
    expect(
      refused(replace({ ...CODED, code: ['  '] }), before).map((each) => each.message),
    ).toEqual(['The code has nothing in it; to remove it, set it to null.']);
    expect(
      refused(replace({ ...CODED, capabilities: ['everything'] }), before).map((each) => each.code),
    ).toEqual(['invalid-command']);
    expect(
      refused(
        replace({ ...CODED, extensions: { actions: [{ id: 'Bad Id' }] } as never }),
        before,
      ).map((each) => each.code),
    ).toEqual(['invalid-code']);
  });

  it('checks its solids as define-solid does, and refuses removing one still shown', () => {
    const before = ok(add(PLAIN)).state;
    expect(
      refused(replace({ ...CODED, solids: [{ ...solid('shop.till'), hash: 'nope' }] }), before).map(
        (each) => each.code,
      ),
    ).toEqual(['invalid-solid']);
    expect(
      refused(replace({ ...CODED, solids: [solid('other.till')] }), before).map(
        (each) => each.code,
      ),
    ).toEqual(['id-outside-package']);
    const shown: PackageFile = {
      ...CODED,
      components: [
        {
          id: 'shop.store',
          name: 'Store',
          derivesFrom: 'essence',
          appearance: { solid: { solid: 'shop.till' } },
        },
      ],
    };
    const showing = ok(replace(shown), before).state;
    const without: PackageFile = { ...shown, solids: undefined };
    expect(refused(replace(without), showing).map((each) => each.code)).toEqual(['in-use']);
  });

  it('checks its crosswalks', () => {
    const before = ok(add(PLAIN)).state;
    for (const crosswalks of [
      {},
      [{ from: 'uberon', to: 'uberon', entries: { a: 'b' } }],
      [{ from: 'UBERON', to: 'fma', entries: { a: 'b' } }],
      [{ from: 'uberon', to: 'fma', entries: {} }],
      [{ from: 'uberon', to: 'fma', entries: { a: 1 } }],
      [{ from: 'uberon', to: 'fma', entries: { a: 'b' }, run: 'x' }],
    ]) {
      expect(
        refused(replace({ ...PLAIN, crosswalks } as never), before).map((each) => each.message),
      ).toEqual([
        'A package’s crosswalks are a list of tables, each mapping identifiers of one scheme to those of another.',
      ]);
    }
  });
});

describe('add-package keeps what the file holds', () => {
  it('stores its code, extensions, solids and crosswalks, as one undoable action', () => {
    const outcome = ok(add(CODED));
    expect(stored(outcome.state)).toEqual(CODED);
    expect(outcome.label).toBe('Add the package "Shop"');
  });

  it('still refuses keys a package does not have', () => {
    expect(refused(add({ ...PLAIN, script: 'alert(1)' } as never))).toEqual([
      expect.objectContaining({ code: 'invalid-command', message: 'A package has no "script".' }),
    ]);
  });
});
