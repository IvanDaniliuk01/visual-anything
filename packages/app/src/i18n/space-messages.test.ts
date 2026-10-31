/**
 * What the core says of poses and of the physical-space panel, in Spanish (ADR-0038, ADR 0076): the
 * labels of posing, every refusal of a pose, the warnings of a pose whose container is gone or no
 * longer holds it, and why a view state's panel cannot be read. Each must read in Spanish through the
 * catalog's templates.
 */
import {
  checkProject,
  checkViewState,
  executeCommand,
  readViewState,
  viewStateProblems,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { translateMessage, untranslatedParts } from './translate';

const INSIDE = 'lab.inside';

function lab(): ProjectSnapshot {
  return {
    project: { schemaVersion: 1, name: 'Lab', packages: ['lab'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        { id: 'hall', component: 'lab.thing', name: 'Hall' },
        {
          id: 'bench',
          component: 'lab.thing',
          name: 'Bench',
          pose: { in: 'hall', at: { x: 0, y: 0, z: 1 } },
        },
        {
          id: 'lamp',
          component: 'lab.thing',
          name: 'Lamp',
          pose: { in: 'gone', at: { x: 0, y: 0, z: 0 } },
        },
      ],
      relations: [{ id: 'bench-in-hall', relationType: INSIDE, from: 'bench', to: 'hall' }],
    },
    packages: [
      {
        id: 'lab',
        name: 'Lab',
        components: [{ id: 'lab.thing', name: 'Thing', derivesFrom: 'essence' }],
        relationTypes: [{ id: INSIDE, name: 'is inside', derivesFrom: 'relates-to', nests: true }],
      },
    ],
    views: [
      {
        id: 'v',
        name: 'Lab',
        perspective: { name: 'Rooms' },
        nestingRelationTypes: [INSIDE],
        positions: [],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const at = { x: 0, y: 0, z: 0 };
const pose = (value: unknown): Command =>
  ({ type: 'update-element', id: 'hall', changes: { pose: value } }) as Command;

const COMMANDS: Command[] = [
  pose({ at }),
  pose(null),
  {
    type: 'set-poses',
    poses: [
      { element: 'hall', pose: { at } },
      { element: 'lamp', pose: null },
    ],
  },
  {
    type: 'set-poses',
    poses: [
      { element: 'bench', pose: null },
      { element: 'lamp', pose: null },
    ],
  },
  { type: 'set-poses', poses: [] },
  { type: 'set-poses', poses: [{ element: 'world', pose: { at } }] },
  pose('here'),
  pose({ at, scale: 1 }),
  pose({ in: 3, at }),
  pose({}),
  pose({ at: { x: 0, y: 0, z: 0, w: 1 } }),
  pose({ at: { x: 'a', y: 0, z: 0 } }),
  pose({ at: { x: 2e6, y: 0, z: 0 } }),
  pose({ at, rotation: 1 }),
  pose({ at, rotation: { x: 0, y: 0, z: 0, w: 1, v: 0 } }),
  pose({ at, rotation: { x: 0, y: 0, z: 0 } }),
  pose({ at, rotation: { x: 0, y: 0, z: 0, w: 2 } }),
  pose({ in: 'nowhere', at }),
  pose({ in: 'lamp', at }),
  { type: 'delete', relations: ['bench-in-hall'] },
];

const SPACES = [
  'open;names',
  'names;names',
  'names:yes',
  'camera:1,2,3',
  'camera:0,0,0,0,90,1',
  'camera:0,0,0,181,0,1',
  'camera:0,0,0,0,0,0',
  'cut:w,1,below',
  'explode:x',
  'explode:3',
  'zoom:2',
];

const SPACE_VALUES: unknown[] = [
  [],
  { zoom: 2 },
  { relations: 'yes' },
  { names: 'yes' },
  { camera: { target: { x: 2e8, y: 0, z: 0 }, azimuth: 0, elevation: 0, distance: 1 } },
  { cut: { axis: 'x', at: 2e8, keep: 'below' } },
];

function messages(): string[] {
  const state = lab();
  const said: string[] = [];
  for (const command of COMMANDS) {
    const outcome = executeCommand(state, command);
    if (outcome.ok) said.push(outcome.label, ...outcome.warnings.map((each) => each.message));
    else said.push(...outcome.problems.map((each) => each.message));
  }
  said.push(...checkProject(state).warnings.map((each) => each.message));
  for (const clause of SPACES) {
    const read = readViewState(`view=v&space=${encodeURIComponent(clause)}`);
    if (read.ok) throw new Error(`space=${clause} was read.`);
    said.push(read.message);
  }
  for (const space of SPACE_VALUES) {
    const checked = checkViewState({ view: 'v', space });
    if (checked.ok) throw new Error(`${JSON.stringify(space)} was checked.`);
    said.push(checked.message);
  }
  said.push(...viewStateProblems(state, { view: 'v', space: { root: 'ghost' } }));
  return said;
}

describe('what the core says of poses and the physical-space panel, in Spanish', () => {
  const said = messages();

  it('says each thing it means to', () => {
    expect(said).toContain('Pose "Hall"');
    expect(said).toContain('Pose 2 elements');
    expect(said).toContain('Take 2 elements out of physical space');
    expect(said).toContain('Take "Hall" out of physical space');
    expect(said.filter((each) => each.startsWith('The pose of')).length).toBeGreaterThan(12);
    expect(said).toContain(
      'The physical-space panel shows "ghost", which is not an element of the project.',
    );
  });

  it('has a Spanish template for every label, refusal and warning', () => {
    expect(said.flatMap((message) => untranslatedParts('es', message))).toEqual([]);
  });

  it('keeps names as they were written', () => {
    expect(translateMessage('es', 'Pose "Hall"')).toBe('Ubicar "Hall"');
    expect(
      translateMessage(
        'es',
        'The pose of "Bench" is measured from "Hall", which no longer holds it; it is kept, and "Bench" is not in physical space until it is posed again.',
      ),
    ).toBe(
      'La ubicación de "Bench" se mide desde "Hall", que ya no lo contiene; se conserva, y "Bench" no está en el espacio físico hasta que se lo ubique de nuevo.',
    );
  });
});
