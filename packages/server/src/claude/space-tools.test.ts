/**
 * Claude's space tools (ADR 0076), the whole way from an MCP client through the bridge to the
 * program: reading what is in physical space for a view and an element the panel shows, posing
 * elements and taking their poses away as one undoable action of Claude's each, the guidance that
 * opens, roots, moves and closes the physical-space panel, and the panel in the view states that
 * get_view_address, open_app and the tour tools take.
 */
import { rotationFromDegrees, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, PackageFile, Pose, SolidDefinition } from '@visual-anything/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startToolHarness, type ToolHarness } from './tool-harness';

const ARM_ID = 'lab.arm-k3f9q2';
const INSIDE = 'lab.inside';

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
  ],
  camera: { azimuth: 30, elevation: 20 },
};

const LAB: PackageFile = {
  id: 'lab',
  name: 'Lab',
  components: [
    {
      id: 'lab.robot',
      name: 'Robot',
      derivesFrom: 'essence',
      appearance: { solid: { solid: ARM_ID, placement: 'parts' } },
    },
    { id: 'lab.thing', name: 'Thing', derivesFrom: 'essence' },
  ],
  relationTypes: [{ id: INSIDE, name: 'is inside', derivesFrom: 'relates-to', nests: true }],
  solids: [ARM],
};

const thing = (id: string, name: string, more: Partial<Element> = {}): Element => ({
  id,
  component: 'lab.thing',
  name,
  ...more,
});

const part = (name: string) => ({ appearance: { part: { part: name, solid: ARM_ID } } });

/**
 * A hall in World, turned a quarter about +Y; an arm posed in it, its base and elbow anchored to its
 * solid's parts, the base keeping a pose it does not use; a camera posed on the elbow; a lamp in the
 * hall with no pose; and a crate whose pose names what does not hold it.
 */
function lab(): ProjectSnapshot {
  const inside = (from: string, to: string) => ({
    id: `${from}-in-${to}`,
    relationType: INSIDE,
    from,
    to,
  });
  return {
    project: { schemaVersion: 1, name: 'Lab', packages: ['lab'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: [
        thing('hall', 'Hall', {
          pose: { at: { x: 10, y: 0, z: 0 }, rotation: rotationFromDegrees(0, 90, 0) },
        }),
        {
          id: 'arm',
          component: 'lab.robot',
          name: 'Arm',
          pose: { in: 'hall', at: { x: 0, y: 0, z: 2 } },
        },
        thing('base', 'Base', { ...part('base'), pose: { at: { x: 99, y: 99, z: 99 } } }),
        thing('elbow', 'Elbow', part('elbow')),
        thing('camera', 'Camera', { pose: { in: 'elbow', at: { x: 0, y: 0.1, z: 0 } } }),
        thing('lamp', 'Lamp'),
        thing('crate', 'Crate', { pose: { in: 'lamp', at: { x: 0, y: 0, z: 0 } } }),
      ],
      relations: [
        inside('arm', 'hall'),
        inside('base', 'arm'),
        inside('elbow', 'arm'),
        inside('camera', 'elbow'),
        inside('lamp', 'hall'),
      ],
    },
    packages: [LAB],
    views: [
      {
        id: 'v',
        name: 'Lab',
        perspective: { name: 'Rooms' },
        nestingRelationTypes: [INSIDE],
        positions: [],
        freeShapes: [],
      },
      {
        id: 'arm-only',
        name: 'The arm alone',
        perspective: { name: 'Rooms' },
        nestingRelationTypes: [INSIDE],
        positions: [],
        freeShapes: [],
        scope: { leftOut: ['arm', 'hall'] },
      },
      {
        id: 'folded',
        name: 'Folded',
        perspective: { name: 'Rooms' },
        nestingRelationTypes: [INSIDE],
        positions: [],
        freeShapes: [],
        collapsed: ['arm'],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

let tools: ToolHarness;

beforeEach(async () => {
  tools = await startToolHarness(lab());
}, 30_000);

afterEach(async () => {
  await tools.close();
});

const poseOf = (id: string): Pose | undefined =>
  tools.session.snapshot.model.elements.find((each) => each.id === id)?.pose;

type Item = Record<string, unknown> & { id: string };
const itemsOf = (answer: Record<string, unknown>) => answer.items as Item[];
const item = (answer: Record<string, unknown>, id: string) =>
  itemsOf(answer).find((each) => each.id === id);

describe('get_space', () => {
  it('lists what is in physical space under World, each with how, in what, its pose and its place', async () => {
    const answer = await tools.value('get_space', { view: 'v' });
    expect(answer).toMatchObject({
      view: 'v',
      shows: { id: 'world', name: 'World' },
      total: 6,
      offset: 0,
    });
    expect(itemsOf(answer).map((each) => each.id)).toEqual([
      'world',
      'hall',
      'arm',
      'base',
      'elbow',
      'camera',
    ]);
    expect(item(answer, 'world')).toMatchObject({ how: 'shown', at: { x: 0, y: 0, z: 0 } });
    expect(item(answer, 'arm')).toEqual({
      id: 'arm',
      name: 'Arm',
      how: 'posed',
      in: { id: 'hall', name: 'Hall' },
      pose: { in: 'hall', at: { x: 0, y: 0, z: 2 } },
      // The hall's quarter turn about +Y takes the arm's 2 m along +Z to +X.
      at: { x: 12, y: 0, z: 0 },
      rotation: { x: 0, y: 0.7071068, z: 0, w: 0.7071068 },
      degrees: { x: 0, y: 90, z: 0 },
      solid: { id: ARM_ID, name: 'Arm' },
    });
    expect(item(answer, 'base')).toMatchObject({
      how: 'anchored',
      in: { id: 'arm', name: 'Arm' },
      part: { solid: ARM_ID, name: 'base', index: 0 },
      at: { x: 12, y: 0.1, z: 0 },
      pose: { at: { x: 99, y: 99, z: 99 } },
    });
    expect(item(answer, 'base')?.poseUnused).toContain('anchored');
    expect(item(answer, 'camera')).toMatchObject({
      how: 'posed',
      in: { id: 'elbow', name: 'Elbow' },
      at: { x: 12, y: 1.1, z: 0 },
    });
    // The crate's pose names the lamp, which does not hold it: kept, and not in physical space.
    expect(answer.posesNotUsed).toEqual([
      {
        id: 'crate',
        name: 'Crate',
        in: 'lamp',
        why: 'Its pose is measured from "Lamp", which is not one of its containers.',
      },
    ]);
  });

  it('lists what is in physical space under an element, measured from its origin', async () => {
    const answer = await tools.value('get_space', { view: 'v', root: 'arm' });
    expect(answer.shows).toEqual({ id: 'arm', name: 'Arm' });
    expect(itemsOf(answer).map((each) => each.id)).toEqual(['arm', 'base', 'elbow', 'camera']);
    expect(item(answer, 'arm')).toMatchObject({ how: 'shown', at: { x: 0, y: 0, z: 0 } });
    expect(item(answer, 'camera')).toMatchObject({ at: { x: 0, y: 1.1, z: 0 } });
  });

  it('reads the whole model when no view is named', async () => {
    const answer = await tools.value('get_space', {});
    expect(answer.view).toBeNull();
    expect(answer.total).toBe(6);
  });

  it('marks the containers drawn faintly, and what a collapsed container draws', async () => {
    const faint = await tools.value('get_space', { view: 'arm-only' });
    expect(itemsOf(faint).map((each) => [each.id, each.faint ?? false])).toEqual([
      ['world', false],
      ['base', false],
      ['elbow', false],
      ['camera', false],
      ['hall', true],
      ['arm', true],
    ]);
    const folded = await tools.value('get_space', { view: 'folded' });
    expect(item(folded, 'elbow')).toMatchObject({ drawnAs: { id: 'arm', name: 'Arm' } });
    expect(item(folded, 'arm')?.drawnAs).toBeUndefined();
  });

  it('lists at most a limit from an offset, and says where to go on', async () => {
    const answer = await tools.value('get_space', { view: 'v', offset: 1, limit: 2 });
    expect(itemsOf(answer).map((each) => each.id)).toEqual(['hall', 'arm']);
    expect(answer).toMatchObject({ total: 6, offset: 1, more: 3 });
    expect(answer.next).toContain('offset 3');
  });

  it('refuses an unknown view and an element the panel cannot show', async () => {
    expect(await tools.failure('get_space', { view: 'nowhere' })).toBe(
      'There is no view "nowhere".',
    );
    expect(await tools.failure('get_space', { root: 'ghost' })).toContain(
      'There is no element "ghost"',
    );
  });
});

describe('set_pose', () => {
  it('poses an element in a container, turned by degrees, as one undoable action of Claude’s', async () => {
    const answer = await tools.value('set_pose', {
      poses: [{ element: 'lamp', in: 'hall', at: { x: 1, y: 2, z: 0 }, degrees: { y: 90 } }],
    });
    expect(answer).toMatchObject({
      done: 'Pose "Lamp"',
      undo: 'The person can undo it in the app.',
    });
    expect(tools.session.history.undo).toEqual({ label: 'Pose "Lamp"', author: 'claude' });
    const pose = poseOf('lamp');
    expect(pose?.in).toBe('hall');
    expect(pose?.at).toEqual({ x: 1, y: 2, z: 0 });
    expect(pose?.rotation?.y).toBeCloseTo(Math.SQRT1_2, 9);
    expect(pose?.rotation?.w).toBeCloseTo(Math.SQRT1_2, 9);
    // In World: the hall at x 10, turned a quarter, takes the lamp's 1 m along +X to −Z.
    const [posed] = answer.posed as { id: string; inWorld: { at: unknown } }[];
    expect(posed?.id).toBe('lamp');
    expect(posed?.inWorld.at).toEqual({ x: 10, y: 2, z: -1 });
  });

  it('poses several elements as one action, with a quaternion, in World when in is left out', async () => {
    const answer = await tools.value('set_pose', {
      poses: [
        { element: 'lamp', at: { x: 0, y: 3, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } },
        { element: 'hall', in: 'world', at: { x: 5, y: 0, z: 0 } },
      ],
    });
    expect(answer.done).toBe('Pose 2 elements');
    // A rotation of no turn is left out.
    expect(poseOf('lamp')).toEqual({ at: { x: 0, y: 3, z: 0 } });
    expect(poseOf('hall')).toEqual({ at: { x: 5, y: 0, z: 0 } });
  });

  it('keeps an element where it is when at is left out, measured from another container', async () => {
    await tools.value('set_pose', { poses: [{ element: 'camera' }] });
    const pose = poseOf('camera');
    expect(pose?.in).toBeUndefined();
    expect(pose?.at.x).toBeCloseTo(12, 9);
    expect(pose?.at.y).toBeCloseTo(1.1, 9);
    expect(pose?.at.z).toBeCloseTo(0, 9);
    // Turned as the arm is, a quarter about +Y.
    expect(pose?.rotation?.y).toBeCloseTo(Math.SQRT1_2, 6);
    // Only turned, where it is.
    await tools.value('set_pose', {
      poses: [{ element: 'camera', degrees: { x: 0, y: 0, z: 0 } }],
    });
    expect(poseOf('camera')?.rotation).toBeUndefined();
    expect(poseOf('camera')?.at.x).toBeCloseTo(12, 9);
  });

  it('refuses what cannot be posed, in the core’s words, and changes nothing', async () => {
    const history = tools.session.history;
    expect(
      await tools.failure('set_pose', {
        poses: [
          {
            element: 'lamp',
            at: { x: 0, y: 0, z: 0 },
            rotation: { x: 0, y: 0, z: 0, w: 1 },
            degrees: { y: 90 },
          },
        ],
      }),
    ).toContain('rotation or degrees, not both');
    expect(
      await tools.failure('set_pose', {
        poses: [
          { element: 'lamp', at: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 2 } },
        ],
      }),
    ).toBe(
      'Refused, so nothing changed: The pose of "Lamp" has a rotation that is not of unit length. (invalid-pose)',
    );
    expect(
      await tools.failure('set_pose', {
        poses: [{ element: 'lamp', in: 'arm', at: { x: 0, y: 0, z: 0 } }],
      }),
    ).toContain('is measured from "Arm", which is not one of its containers');
    expect(
      await tools.failure('set_pose', {
        poses: [{ element: 'lamp', at: { x: 2e6, y: 0, z: 0 } }],
      }),
    ).toContain('past 1,000 km');
    expect(
      await tools.failure('set_pose', { poses: [{ element: 'world', at: { x: 0, y: 0, z: 0 } }] }),
    ).toContain('(world-not-allowed)');
    expect(await tools.failure('set_pose', { poses: [{ element: 'lamp' }] })).toContain(
      'not in physical space under World',
    );
    expect(
      await tools.failure('set_pose', { poses: [{ element: 'ghost', at: { x: 0, y: 0, z: 0 } }] }),
    ).toContain('There is no element "ghost"');
    expect(tools.session.history).toEqual(history);
  });
});

describe('clear_pose', () => {
  it('takes poses away as one action, and says when nothing had one', async () => {
    const answer = await tools.value('clear_pose', { elements: ['hall', 'camera'] });
    expect(answer.done).toBe('Take 2 elements out of physical space');
    expect(tools.session.history.undo).toEqual({
      label: 'Take 2 elements out of physical space',
      author: 'claude',
    });
    expect(poseOf('hall')).toBeUndefined();
    expect(poseOf('camera')).toBeUndefined();
    expect((await tools.value('clear_pose', { elements: ['crate'] })).done).toBe(
      'Take "Crate" out of physical space',
    );
    const none = await tools.value('clear_pose', { elements: ['lamp'] });
    expect(none.done).toBe('Nothing changed, so nothing was recorded.');
  });

  it('refuses an unknown element', async () => {
    expect(await tools.failure('clear_pose', { elements: ['ghost'] })).toContain('ghost');
  });
});

describe('show_space', () => {
  const camera = { target: { x: 0, y: 1, z: 0 }, azimuth: 30, elevation: 20, distance: 4 };

  it('opens the panel on an element at a camera in the open app, recording nothing', async () => {
    const app = await tools.openApp();
    const history = tools.session.history;
    const answer = await tools.value('show_space', { view: 'v', root: 'arm', camera });
    expect(answer).toMatchObject({ shown: 1, shows: { id: 'arm', name: 'Arm' } });
    await tools.value('show_space', { root: 'world', frame: ['camera', 'base'] });
    await tools.value('show_space', { close: true });
    await expect
      .poll(() => tools.guidanceOf(app))
      .toEqual([
        { kind: 'space', root: 'arm', camera, view: 'v' },
        { kind: 'space', root: 'world', frame: ['camera', 'base'] },
        { kind: 'space', close: true },
      ]);
    expect(tools.session.history).toEqual(history);
  });

  it('refuses what the panel cannot show or frame, and what does not go together', async () => {
    expect(await tools.failure('show_space', { root: 'ghost' })).toContain(
      'There is no element "ghost"',
    );
    expect(await tools.failure('show_space', { view: 'nowhere' })).toBe(
      'There is no view "nowhere".',
    );
    expect(await tools.failure('show_space', { root: 'arm', frame: ['lamp'] })).toContain(
      '"Lamp" is not in physical space under "Arm"',
    );
    expect(await tools.failure('show_space', { frame: ['ghost'] })).toContain('ghost');
    expect(await tools.failure('show_space', { camera, frame: ['arm'] })).toContain('not both');
    expect(await tools.failure('show_space', { close: true, root: 'arm' })).toContain(
      'carries nothing else',
    );
  });

  it('says nobody sees it when no app is open', async () => {
    const answer = await tools.value('show_space', { root: 'arm' });
    expect(answer.shown).toBe(0);
    expect(answer.note).toContain('nobody sees this');
  });
});

describe('the physical-space panel in view states', () => {
  const space = {
    root: 'arm',
    camera: { target: { x: 0, y: 1.5, z: -2 }, azimuth: 30, elevation: -20, distance: 4.5 },
    cut: { axis: 'y' as const, at: 1, keep: 'below' as const },
    explode: 0.5,
    relations: true,
    names: true,
  };

  it('is carried by get_view_address and open_app', async () => {
    const address = await tools.value('get_view_address', { view: 'v', space });
    expect(address.fragment).toBe(
      '#view=v&space=root:arm;camera:0,1.5,-2,30,-20,4.5;cut:y,1,below;explode:0.5;relations;names',
    );
    expect((await tools.value('get_view_address', { view: 'v', space: {} })).fragment).toBe(
      '#view=v&space=open',
    );
    const opened = await tools.value('open_app', { view: 'v', space: { root: 'arm' } });
    expect(opened.viewState).toEqual({ view: 'v', space: { root: 'arm' } });
    expect(tools.opened).toHaveLength(1);
  });

  it('refuses a panel that shows what is not an element, or reads out of range', async () => {
    expect(
      await tools.failure('get_view_address', { view: 'v', space: { root: 'ghost' } }),
    ).toContain('The physical-space panel shows "ghost", which is not an element of the project.');
    expect(
      await tools.failure('get_view_address', {
        view: 'v',
        space: { camera: { ...space.camera, target: { x: 2e8, y: 0, z: 0 } } },
      }),
    ).toContain('looks at most 100000000 m');
  });

  it('is kept by a tour step', async () => {
    await tools.value('create_tour', {
      name: 'The arm',
      steps: [{ viewState: { view: 'v', space: { root: 'arm', names: true } }, title: 'The arm' }],
    });
    const [tour] = tools.session.snapshot.tours;
    expect(tour?.steps[0]?.viewState).toEqual({ view: 'v', space: { root: 'arm', names: true } });
  });
});
