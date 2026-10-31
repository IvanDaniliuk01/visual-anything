/**
 * What is in physical space (ADR 0076): `spaceOf` under World and under an element, posed and
 * anchored elements and where they are, what a view shows and draws faintly, collapsed containers,
 * where a relation ends, and `poseIn`, which keeps a place when the container measured from changes.
 */
import type { Element, PackageFile, SolidDefinition, ViewFile } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import type { ProjectSnapshot } from '../snapshot';
import { rotationFromDegrees, transformPoint } from './math';
import { pointInSpace, poseIn, spaceOf } from './space';

const ARM_ID = 'robotics.arm-k3f9q2';
const INSIDE = 'robotics.inside';

const ARM: SolidDefinition = {
  id: ARM_ID,
  name: 'Arm',
  hash: 'a'.repeat(64),
  bytes: 1000,
  bounds: { min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 2, z: 1 } },
  counts: { triangles: 60, vertices: 40, nodes: 3, textures: 0 },
  parts: [
    { name: 'base', point: { x: 0, y: 0.1, z: 0 } },
    { name: 'elbow', parent: 0, point: { x: 0, y: 1, z: 0 } },
    { name: 'empty', parent: 1 },
  ],
  camera: { azimuth: 30, elevation: 20 },
};

const ROBOTICS: PackageFile = {
  id: 'robotics',
  name: 'Robotics',
  components: [
    {
      id: 'robotics.robot',
      name: 'Robot',
      derivesFrom: 'essence',
      appearance: { solid: { solid: ARM_ID, placement: 'parts' } },
    },
    { id: 'robotics.thing', name: 'Thing', derivesFrom: 'essence' },
  ],
  relationTypes: [{ id: INSIDE, name: 'is inside', derivesFrom: 'relates-to', nests: true }],
  solids: [ARM],
};

const TURNED = rotationFromDegrees(0, 90, 0);

const thing = (id: string, more: Partial<Element> = {}): Element => ({
  id,
  component: 'robotics.thing',
  name: id[0]?.toUpperCase() + id.slice(1),
  ...more,
});

const part = (name: string) => ({ appearance: { part: { part: name, solid: ARM_ID } } });

/**
 * A hall in World, turned a quarter about +Y; an arm posed in it, showing its solid with its parts;
 * its base and elbow anchored to them; a camera posed on the elbow; and what is not in space.
 */
function robots(view: Partial<ViewFile> = {}): ProjectSnapshot {
  const inside = (from: string, to: string) => ({
    id: `${from}-in-${to}`,
    relationType: INSIDE,
    from,
    to,
  });
  return {
    project: { schemaVersion: 1, name: 'Robots', packages: ['robotics'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        thing('hall', { pose: { at: { x: 10, y: 0, z: 0 }, rotation: TURNED } }),
        {
          id: 'arm',
          component: 'robotics.robot',
          name: 'Arm',
          pose: { in: 'hall', at: { x: 0, y: 0, z: 2 } },
        },
        thing('base', { ...part('base'), pose: { at: { x: 99, y: 99, z: 99 } } }),
        thing('elbow', part('elbow')),
        thing('hollow', part('empty')),
        thing('camera', { pose: { in: 'elbow', at: { x: 0, y: 0.1, z: 0 } } }),
        thing('loose', { pose: { in: 'arm', at: { x: 1, y: 1, z: 1 } } }),
        thing('lamp'),
        { id: 'spare', component: 'robotics.robot', name: 'Spare' },
      ],
      relations: [
        inside('arm', 'hall'),
        inside('base', 'arm'),
        inside('elbow', 'arm'),
        inside('hollow', 'arm'),
        inside('camera', 'elbow'),
        inside('loose', 'hall'),
      ],
    },
    packages: [ROBOTICS],
    views: [
      {
        id: 'v',
        name: 'Robots',
        perspective: { name: 'Parts' },
        nestingRelationTypes: [INSIDE],
        positions: [],
        freeShapes: [],
        ...view,
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const origin = { x: 0, y: 0, z: 0 };

function near(
  actual: { x: number; y: number; z: number } | undefined,
  expected: { x: number; y: number; z: number },
) {
  expect(actual).toBeDefined();
  for (const axis of ['x', 'y', 'z'] as const)
    expect(actual?.[axis]).toBeCloseTo(expected[axis], 9);
}

describe('spaceOf under World', () => {
  const space = spaceOf(robots());

  it('holds World, what is posed, what is posed in that, and the anchored parts, in that order', () => {
    expect([...space.entries.keys()]).toEqual([
      'world',
      'hall',
      'arm',
      'base',
      'elbow',
      'hollow',
      'camera',
    ]);
    expect(space.entries.get('world')?.how).toBe('root');
    expect(space.entries.get('hall')).toMatchObject({ how: 'posed', in: 'world' });
    expect(space.entries.get('arm')).toMatchObject({
      how: 'posed',
      in: 'hall',
      solid: { id: ARM_ID },
    });
    expect(space.entries.get('elbow')).toMatchObject({
      how: 'anchored',
      in: 'arm',
      part: { solid: ARM_ID, name: 'elbow', index: 1 },
    });
    expect(space.faint.size).toBe(0);
  });

  it('leaves out a pose in what is not a container, and what has no pose, solid or not', () => {
    for (const id of ['loose', 'lamp', 'spare']) expect(space.entries.has(id)).toBe(false);
  });

  it('puts each where its poses and its parts put it', () => {
    const at = (id: string) => transformPoint(space.entries.get(id)?.matrix ?? [], origin);
    near(at('hall'), { x: 10, y: 0, z: 0 });
    // A quarter turn about +Y takes +Z to +X.
    near(at('arm'), { x: 12, y: 0, z: 0 });
    // An anchored part's origin is its point; the base's own pose is kept and not used.
    near(at('base'), { x: 12, y: 0.1, z: 0 });
    near(at('elbow'), { x: 12, y: 1, z: 0 });
    near(at('hollow'), { x: 12, y: 0, z: 0 });
    near(at('camera'), { x: 12, y: 1.1, z: 0 });
  });

  it('ends relations at a part’s point, a solid’s middle, or an origin', () => {
    near(pointInSpace(space, 'elbow'), { x: 12, y: 1, z: 0 });
    // The arm's bounds have their middle 1 m up.
    near(pointInSpace(space, 'arm'), { x: 12, y: 1, z: 0 });
    near(pointInSpace(space, 'camera'), { x: 12, y: 1.1, z: 0 });
    expect(pointInSpace(space, 'lamp')).toBeUndefined();
  });
});

describe('spaceOf under an element', () => {
  it('puts the root at the origin, with what is posed or anchored in it, and nothing else', () => {
    const space = spaceOf(robots(), undefined, 'arm');
    expect([...space.entries.keys()]).toEqual(['arm', 'base', 'elbow', 'hollow', 'camera']);
    near(transformPoint(space.entries.get('camera')?.matrix ?? [], origin), { x: 0, y: 1.1, z: 0 });
  });

  it('shows an element with no pose alone, with its solid', () => {
    const space = spaceOf(robots(), undefined, 'spare');
    expect([...space.entries.keys()]).toEqual(['spare']);
    expect(space.entries.get('spare')).toMatchObject({ how: 'root', solid: { id: ARM_ID } });
  });

  it('is empty for an element that does not exist', () => {
    expect(spaceOf(robots(), undefined, 'gone').entries.size).toBe(0);
  });
});

describe('spaceOf for a view', () => {
  it('draws faintly what a shown element is in space through and the view does not show', () => {
    const state = robots({ scope: { leftOut: ['arm', 'hall'] } });
    const space = spaceOf(state, state.views[0]);
    expect(space.entries.has('arm')).toBe(false);
    expect(space.entries.has('camera')).toBe(true);
    expect([...space.faint.keys()].sort()).toEqual(['arm', 'hall']);
  });

  it('draws what is inside a collapsed container as its outermost collapsed container', () => {
    const state = robots({ collapsed: ['arm', 'hall'] });
    const space = spaceOf(state, state.views[0]);
    expect(space.entries.get('camera')?.drawnAs).toBe('hall');
    expect(space.entries.get('arm')?.drawnAs).toBe('hall');
    expect(space.entries.get('hall')?.drawnAs).toBeUndefined();
  });

  it('draws as its collapsed container what that container holds, whatever it is posed in', () => {
    const state = robots({ collapsed: ['hall'] });
    const stool = thing('stool', { pose: { at: { x: 1, y: 0, z: 1 } } });
    const held: ProjectSnapshot = {
      ...state,
      model: {
        ...state.model,
        elements: [...state.model.elements, stool],
        relations: [
          ...state.model.relations,
          { id: 'stool-in-hall', relationType: INSIDE, from: 'stool', to: 'hall' },
        ],
      },
    };
    const space = spaceOf(held, held.views[0]);
    expect(space.entries.get('stool')?.drawnAs).toBe('hall');
  });

  it('never draws what the panel shows, or what is in it, as a container that holds it', () => {
    const state = robots({ collapsed: ['hall'] });
    const space = spaceOf(state, state.views[0], 'arm');
    for (const entry of space.entries.values()) expect(entry.drawnAs).toBeUndefined();
  });
});

describe('poseIn', () => {
  it('measures where an element is from another container, keeping its place', () => {
    const state = robots();
    const pose = poseIn(state, 'arm', undefined);
    expect(pose?.in).toBeUndefined();
    near(pose?.at, { x: 12, y: 0, z: 0 });
    expect(pose?.rotation?.y).toBeCloseTo(TURNED.y, 9);
    expect(poseIn(state, 'camera', 'arm')).toEqual({ in: 'arm', at: { x: 0, y: 1.1, z: 0 } });
  });

  it('is undefined for what is not in space', () => {
    expect(poseIn(robots(), 'lamp', undefined)).toBeUndefined();
    expect(poseIn(robots(), 'arm', 'lamp')).toBeUndefined();
  });
});
