import type { SolidDefinition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { executeCommand, type Command, type CommandOutcome } from '../commands';
import { applyOperations } from '../operations';
import type { ProjectSnapshot } from '../snapshot';
import { sequentialIds } from '../test/fixtures';
import { boxMesh, writeTestSolid } from '../test/solids';
import { imageProject } from '../images/test/project';
import {
  MAX_SOLID_PIECE_TEXT,
  checkSolids,
  readSolid,
  readSolidGet,
  readSolidPrepare,
  solidPartsLostByReplacing,
  solidUsers,
  solidsIn,
} from './index';

/** A solid's definition, as the local program would send it for the arm it cleaned. */
function definition(id = 'clinic.arm-k3f9q2'): SolidDefinition {
  const bytes = writeTestSolid({
    nodes: [
      { name: 'base', mesh: 0, children: [1] },
      { name: 'elbow', mesh: 1 },
    ],
    meshes: [boxMesh([-0.2, 0, -0.2], [0.2, 0.1, 0.2]), boxMesh([0, 0.1, 0], [0.1, 0.5, 0.1])],
  });
  const reading = readSolid(bytes);
  if (!reading.ok) throw new Error('The arm does not read.');
  const { bounds, counts, parts } = reading.description;
  return {
    id,
    name: 'Arm',
    description: 'A two-part arm on a base.',
    source: 'Drawn for Visual Anything',
    license: 'CC0-1.0',
    hash: reading.hash,
    bytes: reading.bytes,
    bounds,
    counts,
    parts,
    camera: { azimuth: 30, elevation: 20 },
  };
}

function run(state: ProjectSnapshot, command: Command): Extract<CommandOutcome, { ok: true }> {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome;
}

function refusal(state: ProjectSnapshot, command: Command): string[] {
  const outcome = executeCommand(state, command, { newId: sequentialIds() });
  if (outcome.ok) throw new Error(`Accepted: ${outcome.label}`);
  return outcome.problems.map((each) => each.code);
}

function undoes(before: ProjectSnapshot, outcome: Extract<CommandOutcome, { ok: true }>): void {
  expect(applyOperations(outcome.state, outcome.inverse).state).toStrictEqual(before);
}

describe('define-solid', () => {
  it('defines a solid in an own package, as one undoable action named by its file', () => {
    const before = imageProject();
    const outcome = run(before, {
      type: 'define-solid',
      package: 'clinic',
      solid: definition(),
      fileName: 'arm.glb',
    });
    expect(outcome.label).toBe('Import "arm.glb" as a solid');
    expect(
      solidsIn(outcome.state)
        .solid('clinic.arm-k3f9q2')
        ?.definition.parts.map((p) => p.name),
    ).toEqual(['base', 'elbow']);
    undoes(before, outcome);
  });

  it('replaces a solid it defines again, and refuses that with createOnly', () => {
    const once = run(imageProject(), {
      type: 'define-solid',
      package: 'clinic',
      solid: definition(),
    });
    const replaced = run(once.state, {
      type: 'define-solid',
      package: 'clinic',
      solid: { ...definition(), name: 'Arm, again' },
      fileName: 'arm-2.glb',
    });
    expect(replaced.label).toBe('Replace the solid "Arm, again" with "arm-2.glb"');
    undoes(once.state, replaced);
    expect(
      refusal(once.state, {
        type: 'define-solid',
        package: 'clinic',
        solid: definition(),
        createOnly: true,
      }),
    ).toEqual(['id-taken']);
  });

  it.each<[string, (solid: SolidDefinition) => unknown, string]>([
    ['an id outside its package', (solid) => ({ ...solid, id: 'other.arm' }), 'id-outside-package'],
    ['a hash that is not SHA-256', (solid) => ({ ...solid, hash: 'abc' }), 'invalid-solid'],
    ['a key no definition has', (solid) => ({ ...solid, uri: 'x' }), 'invalid-solid'],
    [
      'a part named twice',
      (solid) => ({ ...solid, parts: [{ name: 'a' }, { name: 'a' }] }),
      'invalid-solid',
    ],
    [
      'a part held by one after it',
      (solid) => ({ ...solid, parts: [{ name: 'a', parent: 1 }, { name: 'b' }] }),
      'invalid-solid',
    ],
    ['a file past 32 MiB', (solid) => ({ ...solid, bytes: 40 * 1024 * 1024 }), 'solid-too-large'],
    [
      'a camera past its range',
      (solid) => ({ ...solid, camera: { azimuth: 0, elevation: 90 } }),
      'invalid-solid',
    ],
    [
      'a license nobody knows',
      (solid) => ({ ...solid, license: 'not a license!' }),
      'invalid-solid',
    ],
  ])('refuses %s', (_, change, code) => {
    expect(
      refusal(imageProject(), {
        type: 'define-solid',
        package: 'clinic',
        solid: change(definition()) as SolidDefinition,
      }),
    ).toEqual([code]);
  });

  it("refuses a solid in a package that is not the project's own", () => {
    const state = imageProject();
    const codes = refusal(state, {
      type: 'define-solid',
      package: 'systems',
      solid: definition('systems.arm'),
    });
    expect(codes.length).toBe(1);
  });
});

describe('update-solid and remove-solid', () => {
  const withArm = () =>
    run(imageProject(), { type: 'define-solid', package: 'clinic', solid: definition() }).state;

  it('changes what a solid says about itself, and takes a description away with null', () => {
    const before = withArm();
    const outcome = run(before, {
      type: 'update-solid',
      id: 'clinic.arm-k3f9q2',
      changes: {
        name: 'Robot arm',
        description: null,
        camera: { azimuth: -45, elevation: 10, zoom: 2 },
      },
    });
    const solid = solidsIn(outcome.state).solid('clinic.arm-k3f9q2')?.definition;
    expect(solid?.name).toBe('Robot arm');
    expect(solid?.description).toBeUndefined();
    expect(solid?.camera).toEqual({ azimuth: -45, elevation: 10, zoom: 2 });
    undoes(before, outcome);
    expect(
      refusal(before, {
        type: 'update-solid',
        id: 'clinic.arm-k3f9q2',
        changes: { hash: 'x' } as never,
      }),
    ).toEqual(['invalid-command']);
  });

  it('removes a solid nothing shows, and refuses one an appearance or a part names', () => {
    const before = withArm();
    const removed = run(before, { type: 'remove-solid', id: 'clinic.arm-k3f9q2' });
    expect(solidsIn(removed.state).solid('clinic.arm-k3f9q2')).toBeUndefined();
    undoes(before, removed);

    const shown = run(before, {
      type: 'update-element',
      id: 'plain',
      changes: { appearance: { solid: { solid: 'clinic.arm-k3f9q2', placement: 'parts' } } },
    }).state;
    expect(solidUsers(shown, 'clinic.arm-k3f9q2')).toEqual(['plain']);
    expect(refusal(shown, { type: 'remove-solid', id: 'clinic.arm-k3f9q2' })).toEqual(['in-use']);

    const anchored = run(before, {
      type: 'update-element',
      id: 'booking',
      changes: { appearance: { part: { part: 'elbow', solid: 'clinic.arm-k3f9q2' } } },
    }).state;
    expect(refusal(anchored, { type: 'remove-solid', id: 'clinic.arm-k3f9q2' })).toEqual([
      'in-use',
    ]);
  });

  it('says which anchored parts replacing a solid would lose', () => {
    const anchored = run(withArm(), {
      type: 'update-element',
      id: 'booking',
      changes: { appearance: { part: { part: 'elbow', solid: 'clinic.arm-k3f9q2' } } },
    }).state;
    expect(solidPartsLostByReplacing(anchored, 'clinic.arm-k3f9q2', [{ name: 'base' }])).toEqual([
      { part: 'elbow', elements: ['booking'] },
    ]);
    expect(solidPartsLostByReplacing(anchored, 'clinic.arm-k3f9q2', [{ name: 'elbow' }])).toEqual(
      [],
    );
  });

  it('refuses a part that names both an image and a solid', () => {
    expect(
      refusal(withArm(), {
        type: 'update-element',
        id: 'booking',
        changes: {
          appearance: {
            part: { part: 'elbow', solid: 'clinic.arm-k3f9q2', image: 'clinic.logo-k3f9q2' },
          },
        },
      }),
    ).toEqual(['invalid-appearance']);
  });
});

describe('a component’s solid, trait by trait', () => {
  it('gives a component a solid and takes it out again, each one undoable action', () => {
    const before = run(imageProject(), {
      type: 'define-solid',
      package: 'clinic',
      solid: definition(),
    }).state;
    const shown = run(before, {
      type: 'set-component-appearance',
      component: 'clinic.calendar',
      appearanceTraits: {
        solid: {
          solid: 'clinic.arm-k3f9q2',
          placement: 'drawing',
          camera: { azimuth: 10, elevation: 5 },
        },
      },
    });
    expect(solidUsers(shown.state, 'clinic.arm-k3f9q2')).toEqual(['clinic.calendar']);
    undoes(before, shown);
    const taken = run(shown.state, {
      type: 'set-component-appearance',
      component: 'clinic.calendar',
      appearanceTraits: { solid: null },
    });
    expect(solidUsers(taken.state, 'clinic.arm-k3f9q2')).toEqual([]);
  });
});

describe('checkSolids', () => {
  it('warns of a solid or a part no package defines, and of a part a solid lacks', () => {
    const state = run(imageProject(), {
      type: 'define-solid',
      package: 'clinic',
      solid: definition(),
    }).state;
    const named = (id: string, appearance: Record<string, unknown>) =>
      run(state, { type: 'update-element', id, changes: { appearance } }).state;
    expect(checkSolids(state)).toEqual({ errors: [], warnings: [] });
    const unknown = named('plain', { solid: { solid: 'clinic.gone' } });
    expect(checkSolids(unknown).warnings.map((each) => each.code)).toEqual(['unknown-solid']);
    const lacking = named('booking', { part: { part: 'wrist', solid: 'clinic.arm-k3f9q2' } });
    expect(checkSolids(lacking).warnings.map((each) => each.code)).toEqual(['unknown-part']);
  });
});

describe('the messages about solids', () => {
  it('read a piece of a file to import, with its options in the first piece only', () => {
    const read = readSolidPrepare({
      type: 'solid/prepare',
      requestId: 'r1',
      fileName: 'arm.glb',
      piece: { index: 0, count: 2, data: 'AAAA' },
      options: { units: 'mm', up: 'z', simplify: true },
    });
    expect(read.ok).toBe(true);
    const later = readSolidPrepare({
      type: 'solid/prepare',
      requestId: 'r1',
      fileName: 'arm.glb',
      piece: { index: 1, count: 2, data: 'AAAA' },
      options: { units: 'mm' },
    });
    expect(later.ok).toBe(false);
  });

  it.each<[string, Record<string, unknown>]>([
    ['a folder in the name', { fileName: '../arm.glb' }],
    ['a piece past its count', { piece: { index: 2, count: 2, data: 'AAAA' } }],
    ['too many pieces', { piece: { index: 0, count: 257, data: 'AAAA' } }],
    [
      'a piece past 1 MiB',
      { piece: { index: 0, count: 1, data: 'A'.repeat(MAX_SOLID_PIECE_TEXT + 4) } },
    ],
    ['text that is not base64', { piece: { index: 0, count: 1, data: 'AA!A' } }],
    ['a key it has none of', { url: 'http://x' }],
  ])('refuse %s', (_, change) => {
    expect(
      readSolidPrepare({
        type: 'solid/prepare',
        requestId: 'r1',
        fileName: 'arm.glb',
        piece: { index: 0, count: 1, data: 'AAAA' },
        ...change,
      }).ok,
    ).toBe(false);
  });

  it('ask for a file only by its hash', () => {
    expect(readSolidGet({ type: 'solid/get', requestId: 'r', hash: 'a'.repeat(64) }).ok).toBe(true);
    expect(readSolidGet({ type: 'solid/get', requestId: 'r', hash: '../x' }).ok).toBe(false);
    expect(
      readSolidGet({ type: 'solid/get', requestId: 'r', hash: 'a'.repeat(64), path: 'x' }).ok,
    ).toBe(false);
  });
});
