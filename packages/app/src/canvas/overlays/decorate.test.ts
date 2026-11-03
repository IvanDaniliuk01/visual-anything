/**
 * What a view's overlays and its appearances' levels of detail make of the scene (ADR 0055): colors
 * drawn as stored in both themes, fades toward what a shape is drawn on, sizes around a shape's
 * middle that layout never sees, badges in the detail, levels on shapes and rows, and lines; and a
 * scene built after any of these equals one built from nothing.
 */
import {
  DATA_MODELING,
  applyOperations,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { LevelOfDetail, Overlay, ViewFile } from '@visual-anything/schema';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { withFaces } from '../../test/faces';
import { loadSample } from '../../test/sample';
import { faceText } from '../faces';
import { indexScene, indexSceneAfresh } from '../hit';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from '../scene';
import { NOT_EXPANDED } from './collapsed';
import { laidOutRect } from './decorate';

const VIEW = 'system-overview';

function withView(project: ProjectSnapshot, change: (view: ViewFile) => ViewFile): ProjectSnapshot {
  return {
    ...project,
    views: project.views.map((view) => (view.id === VIEW ? change(view) : view)),
  };
}

function withOverlays(overlays: Overlay[], project = loadSample()): ProjectSnapshot {
  return withView(project, (view) => ({ ...view, overlays }));
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const shape = scene.shapes.find((each) => each.key === key);
  if (!shape) throw new Error(`No shape ${key}.`);
  return shape;
}

const byOwner: Overlay = {
  id: 'owner',
  of: 'elements',
  attribute: 'owner',
  channel: 'fill',
  mapping: {
    kind: 'discrete',
    cases: [{ value: 'Scheduling team', color: '#FDE68A' }],
    otherwise: '#E5E7EB',
  },
};

const API = 'clinic-booking/scheduling/appointments-api';
const DB = 'clinic-booking/scheduling/appointments-db';

describe('overlays on the scene', () => {
  it('color shapes as stored colors are drawn, in both themes', () => {
    const plain = buildSceneAfresh(loadSample(), VIEW);
    const scene = buildSceneAfresh(withOverlays([byOwner]), VIEW);
    const api = shapeOf(scene, API);
    expect(api.fill).toBe('#FDE68A');
    expect(api.dark?.fill ?? api.fill).toBe('#FDE68A');
    expect(api.stroke).toBe(shapeOf(plain, API).stroke);
    // Elements without the attribute take what any other value takes; World's contents too.
    expect(shapeOf(scene, 'patient').fill).toBe('#E5E7EB');
    // Nothing moves.
    expect(scene.shapes.map((shape) => shape.rect)).toEqual(
      plain.shapes.map((shape) => shape.rect),
    );
  });

  it('fade a shape toward its container’s fill, or toward the canvas', () => {
    const fade: Overlay = {
      id: 'fade',
      of: 'elements',
      attribute: 'owner',
      channel: 'opacity',
      mapping: { kind: 'discrete', cases: [{ value: 'Scheduling team', opacity: 0.5 }] },
    };
    const plain = buildSceneAfresh(loadSample(), VIEW);
    const scene = buildSceneAfresh(
      withOverlays([
        {
          ...byOwner,
          id: 'all',
          mapping: { kind: 'discrete', cases: [{ value: 'Scheduling team', color: '#000000' }] },
        },
        fade,
      ]),
      VIEW,
    );
    const api = shapeOf(scene, API);
    const holder = shapeOf(scene, 'clinic-booking/scheduling');
    // Halfway from black to what holds it.
    const half = (from: string) =>
      `#${[1, 3, 5]
        .map((at) =>
          Math.round(parseInt(from.slice(at, at + 2), 16) / 2)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('')}`.toUpperCase();
    expect(api.fill).toBe(half(holder.fill));
    expect(api.dark?.fill).toBe(half(holder.dark?.fill ?? holder.fill));
    expect(shapeOf(plain, API).rect).toEqual(api.rect);
  });

  it('size a shape around its middle, keeping where layout put it, and grow what holds it', () => {
    const size: Overlay = {
      id: 'size',
      of: 'elements',
      attribute: 'sizeGb',
      channel: 'size',
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 0, size: 1 },
          { at: 12, size: 2 },
        ],
      },
    };
    const plain = buildSceneAfresh(loadSample(), VIEW);
    const scene = buildSceneAfresh(withOverlays([size]), VIEW);
    const before = shapeOf(plain, DB);
    const db = shapeOf(scene, DB);
    expect(db.laidOut).toEqual(before.rect);
    expect(laidOutRect(db)).toEqual(before.rect);
    expect(db.rect.width).toBe(before.rect.width * 2);
    expect(db.rect.x + db.rect.width / 2).toBe(before.rect.x + before.rect.width / 2);
    expect(db.rect.y + db.rect.height / 2).toBe(before.rect.y + before.rect.height / 2);
    expect(db.extent).toEqual(db.rect);
    // What holds it holds all of it, World's shapes included.
    for (const key of ['clinic-booking/scheduling', 'clinic-booking']) {
      const holder = shapeOf(scene, key);
      expect(holder.rect).toEqual(shapeOf(plain, key).rect);
      expect(holder.extent.x).toBeLessThanOrEqual(db.rect.x);
      expect(holder.extent.x + holder.extent.width).toBeGreaterThanOrEqual(
        db.rect.x + db.rect.width,
      );
      expect(holder.extent.y + holder.extent.height).toBeGreaterThanOrEqual(
        db.rect.y + db.rect.height,
      );
    }
    // Relations attach to the shape as it is drawn.
    const read = scene.relations.find((line) => line.relation === 'api-reads-db');
    const end = read?.to;
    expect(end).toBeDefined();
    if (end) {
      const onBorder =
        Math.abs(end.x - db.rect.x) < 1e-6 ||
        Math.abs(end.x - (db.rect.x + db.rect.width)) < 1e-6 ||
        Math.abs(end.y - db.rect.y) < 1e-6 ||
        Math.abs(end.y - (db.rect.y + db.rect.height)) < 1e-6;
      expect(onBorder).toBe(true);
    }
    // A container that shows its contents keeps its size.
    const containers: Overlay = {
      ...size,
      id: 'all',
      mapping: { kind: 'discrete', cases: [{ value: 'x', size: 2 }], otherwise: 2 },
    };
    const all = buildSceneAfresh(withOverlays([containers]), VIEW);
    expect(shapeOf(all, 'clinic-booking').rect).toEqual(shapeOf(plain, 'clinic-booking').rect);
    expect(shapeOf(all, 'patient').rect.width).toBe(shapeOf(plain, 'patient').rect.width * 2);
  });

  it('write badges after a shape’s own detail', () => {
    const badge: Overlay = {
      id: 'engine',
      of: 'elements',
      attribute: 'engine',
      channel: 'badge',
      mapping: { kind: 'passthrough' },
    };
    const plain = buildSceneAfresh(loadSample(), VIEW);
    const scene = buildSceneAfresh(withOverlays([badge]), VIEW);
    const own = shapeOf(plain, DB).detail ?? '';
    expect(shapeOf(scene, DB).detail).toBe(own === '' ? 'postgres' : `${own} · postgres`);
    expect(shapeOf(scene, API).detail).toBe(shapeOf(plain, API).detail);
  });

  it('write a badge among a face’s badges (ADR 0083)', () => {
    const badge: Overlay = {
      id: 'engine',
      of: 'elements',
      attribute: 'engine',
      channel: 'badge',
      mapping: { kind: 'passthrough' },
    };
    const db = shapeOf(buildSceneAfresh(withOverlays([badge]), VIEW), DB).element;
    const component = loadSample().model.elements.find((each) => each.id === db)?.component;
    const project = withFaces(withOverlays([badge]), {
      [component as string]: { markup: ['<b>{{name}}</b> <badges/>'] },
    });
    const shape = shapeOf(buildSceneAfresh(project, VIEW), DB);
    expect(shape.face?.input.badges?.at(-1)).toBe('postgres');
    expect(faceText(shape)).toContain('postgres');
    // Each badge is laid out once.
    const first = shapeOf(buildScene(project, VIEW), DB);
    expect(shapeOf(buildScene({ ...project }, VIEW), DB).face).toBe(first.face);
  });

  it('change relations’ lines: their stroke, width, name and fade', () => {
    const project = loadSample();
    project.model.relations = project.model.relations.map((relation) =>
      relation.id === 'agent-to-api' ? { ...relation, attributes: { rate: 40 } } : relation,
    );
    const lines: Overlay[] = [
      {
        id: 'stroke',
        of: 'relations',
        attribute: 'rate',
        channel: 'stroke',
        mapping: {
          kind: 'continuous',
          stops: [
            { at: 0, color: '#000000' },
            { at: 40, color: '#FF0000' },
          ],
        },
      },
      {
        id: 'width',
        of: 'relations',
        attribute: 'rate',
        channel: 'size',
        mapping: { kind: 'discrete', cases: [{ value: '40', size: 2 }] },
      },
      {
        id: 'badge',
        of: 'relations',
        attribute: 'rate',
        channel: 'badge',
        mapping: { kind: 'passthrough' },
      },
    ];
    const plain = buildSceneAfresh(project, VIEW);
    const scene = buildSceneAfresh(withOverlays(lines, project), VIEW);
    const line = scene.relations.find((each) => each.relation === 'agent-to-api');
    const was = plain.relations.find((each) => each.relation === 'agent-to-api');
    expect(line?.stroke).toBe('#FF0000');
    expect(line?.darkStroke).toBeUndefined();
    expect(line?.width).toBe((was?.width ?? 0) * 2);
    expect(line?.label).toBe(was?.label === undefined ? '40' : `${was.label} · 40`);
    expect(line?.route).toEqual(was?.route);
    // The others keep theirs, the same objects.
    const other = scene.relations.find((each) => each.relation === 'api-reads-db');
    expect(other).toEqual(plain.relations.find((each) => each.relation === 'api-reads-db'));
  });

  it('set nothing for an overlay turned off', () => {
    const plain = buildSceneAfresh(loadSample(), VIEW);
    const scene = buildSceneAfresh(withOverlays([{ ...byOwner, off: true }]), VIEW);
    expect(scene).toEqual(plain);
  });
});

describe('levels of detail on the scene', () => {
  const LEVELS: LevelOfDetail[] = [
    { from: 0.3, shows: ['name'] },
    { from: 0.9, shows: ['name', 'detail', 'image'] },
  ];

  it('go on the shapes of the components that declare them, and on what derives from them', () => {
    const project = loadSample();
    const outcome = executeCommand(project, {
      type: 'set-component-appearance',
      component: 'systems.service',
      appearanceTraits: { levels: LEVELS },
    });
    if (!outcome.ok) throw new Error('Refused.');
    const scene = buildSceneAfresh(outcome.state, VIEW);
    expect(shapeOf(scene, API).levels?.map((level) => level.from)).toEqual([0.3, 0.9]);
    // The AI agent derives from Service.
    expect(shapeOf(scene, 'clinic-booking/booking-agent').levels).toBeDefined();
    expect(shapeOf(scene, 'patient').levels).toBeUndefined();
  });

  it('go on rows as their container declares them', () => {
    const project: ProjectSnapshot = {
      project: { schemaVersion: 1, name: 'Tables', packages: ['data-modeling'] },
      model: {
        world: { id: 'world', component: 'essence', name: 'World' },
        elements: [
          {
            id: 'users',
            component: 'data-modeling.table',
            name: 'users',
            appearance: { levels: [{ from: 1, shows: ['name', 'contents'] }] },
          },
          { id: 'users-id', component: 'data-modeling.column', name: 'id' },
        ],
        relations: [
          { id: 'in', relationType: 'data-modeling.is-column-of', from: 'users-id', to: 'users' },
        ],
      },
      packages: [DATA_MODELING],
      views: [
        {
          id: VIEW,
          name: 'Tables',
          perspective: { name: 'Schema' },
          nestingRelationTypes: ['data-modeling.is-column-of'],
          positions: [{ element: 'users', x: 0, y: 0 }],
          freeShapes: [],
        },
      ],
      scenarios: [],
      tours: [],
      comments: [],
    };
    const scene = buildSceneAfresh(project, VIEW);
    expect(shapeOf(scene, 'users/users-id').levels).toBe(shapeOf(scene, 'users').levels);
  });
});

describe('a look that leaves a shape or a line as it was', () => {
  // Found by "equals one built from nothing" with seed 1712769506: a load of 999 fades by 0.9992,
  // which rounds to the colors the shape already had, and the shape was made again as an equal one.
  const nearlyOpaque = (of: 'elements' | 'relations'): Overlay => ({
    id: `fade-${of}`,
    of,
    attribute: 'load',
    channel: 'opacity',
    mapping: {
      kind: 'continuous',
      stops: [
        { at: 0, opacity: 0.2 },
        { at: 1000, opacity: 1 },
      ],
    },
  });
  const loaded = (): ProjectSnapshot => {
    const project = loadSample();
    return {
      ...project,
      model: {
        ...project.model,
        elements: project.model.elements.map((element) =>
          element.id === 'clinic-booking'
            ? { ...element, attributes: { ...element.attributes, load: 999 } }
            : element,
        ),
        relations: project.model.relations.map((relation) => ({
          ...relation,
          attributes: { ...relation.attributes, load: 999 },
        })),
      },
    };
  };

  it('keeps the shape and the line as the same objects', () => {
    const project = loaded();
    const plain = buildScene(project, VIEW);
    const faded = buildScene(
      withView(project, (view) => ({
        ...view,
        overlays: [nearlyOpaque('elements'), nearlyOpaque('relations')],
      })),
      VIEW,
    );
    expect(shapeOf(faded, 'clinic-booking')).toBe(shapeOf(plain, 'clinic-booking'));
    expect(faded.relations.length).toBeGreaterThan(0);
    faded.relations.forEach((line, at) => expect(line).toBe(plain.relations[at]));
  });
});

describe('expanding by zoom on the scene', () => {
  it('draws a collapsed container expanded, the view still keeping it collapsed', () => {
    const project = withView(loadSample(), (view) => ({ ...view, collapsed: ['scheduling'] }));
    const collapsed = buildSceneAfresh(project, VIEW);
    expect(shapeOf(collapsed, 'clinic-booking/scheduling').collapsed).toBeDefined();
    const expanded = buildSceneAfresh(project, VIEW, new Set(['scheduling']));
    expect(shapeOf(expanded, 'clinic-booking/scheduling').collapsed).toBeUndefined();
    expect(expanded.shapes.some((shape) => shape.key === API)).toBe(true);
    expect(buildScene(project, VIEW, new Set(['scheduling']))).toEqual(expanded);
    expect(buildScene(project, VIEW, NOT_EXPANDED)).toEqual(collapsed);
  });
});

// A scene built after an edit equals one built from nothing -----------------------------------------

type Edit =
  | { kind: 'overlays'; pick: number }
  | { kind: 'turn-off'; on: boolean }
  | { kind: 'levels'; pick: number }
  | { kind: 'attribute'; element: number; value: number }
  | { kind: 'drag'; shape: number; dx: number; dy: number }
  | { kind: 'collapse'; element: number }
  | { kind: 'expand'; pick: number }
  | { kind: 'undo' };

const OVERLAY_SETS: Overlay[][] = [
  [],
  [byOwner],
  [
    {
      id: 'load',
      of: 'elements',
      attribute: 'load',
      channel: 'size',
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 0, size: 0.5 },
          { at: 1000, size: 2 },
        ],
      },
    },
    {
      id: 'fade',
      of: 'elements',
      attribute: 'load',
      channel: 'opacity',
      mapping: {
        kind: 'continuous',
        stops: [
          { at: 0, opacity: 0.2 },
          { at: 1000, opacity: 1 },
        ],
      },
    },
  ],
  [
    { ...byOwner, id: 'stroke', channel: 'stroke' },
    {
      id: 'badge',
      of: 'elements',
      attribute: 'load',
      channel: 'badge',
      mapping: { kind: 'passthrough' },
    },
    {
      id: 'lines',
      of: 'relations',
      attribute: 'name',
      channel: 'stroke',
      mapping: {
        kind: 'discrete',
        cases: [{ value: 'x', color: '#000000' }],
        otherwise: '#B42318',
      },
    },
  ],
];

const LEVEL_SETS: (LevelOfDetail[] | null)[] = [
  null,
  [{ from: 0.5, shows: ['name'] }],
  [
    { from: 0, shows: ['silhouette'] },
    { from: 1, shows: ['name', 'detail', 'contents', 'image'] },
  ],
];

const pick = fc.nat({ max: 1000 });
const edit: fc.Arbitrary<Edit> = fc.oneof(
  { weight: 3, arbitrary: fc.record({ kind: fc.constant('overlays' as const), pick }) },
  { weight: 1, arbitrary: fc.record({ kind: fc.constant('turn-off' as const), on: fc.boolean() }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('levels' as const), pick }) },
  {
    weight: 3,
    arbitrary: fc.record({ kind: fc.constant('attribute' as const), element: pick, value: pick }),
  },
  {
    weight: 2,
    arbitrary: fc.record({
      kind: fc.constant('drag' as const),
      shape: pick,
      dx: fc.integer({ min: -200, max: 200 }),
      dy: fc.integer({ min: -200, max: 200 }),
    }),
  },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('collapse' as const), element: pick }) },
  { weight: 2, arbitrary: fc.record({ kind: fc.constant('expand' as const), pick }) },
  { weight: 1, arbitrary: fc.constant({ kind: 'undo' as const }) },
);

function at<T>(list: readonly T[], number: number): T | undefined {
  return list.length === 0 ? undefined : list[number % list.length];
}

function commandOf(edit: Edit, project: ProjectSnapshot, scene: Scene): Command | undefined {
  const view = project.views.find((each) => each.id === VIEW) as ViewFile;
  switch (edit.kind) {
    case 'overlays':
      return { type: 'set-overlays', view: VIEW, overlays: at(OVERLAY_SETS, edit.pick) ?? [] };
    case 'turn-off': {
      const first = view.overlays?.[0];
      return (
        first && {
          type: 'update-overlay',
          view: VIEW,
          overlay: first.id,
          changes: { off: !edit.on },
        }
      );
    }
    case 'levels':
      return {
        type: 'set-component-appearance',
        component: 'systems.service',
        appearanceTraits: { levels: at(LEVEL_SETS, edit.pick) ?? null },
      };
    case 'attribute': {
      const element = at(project.model.elements, edit.element);
      return (
        element && {
          type: 'update-element',
          id: element.id,
          changes: { attributes: { load: edit.value } },
        }
      );
    }
    case 'drag': {
      const shape = at(scene.shapes, edit.shape);
      return (
        shape && {
          type: 'set-positions',
          view: VIEW,
          positions: [
            {
              element: shape.element,
              ...(shape.container === undefined ? {} : { container: shape.container }),
              x: shape.offset.x + edit.dx,
              y: shape.offset.y + edit.dy,
              ...shape.storedSize,
              pinned: true,
            },
          ],
        }
      );
    }
    case 'collapse': {
      const containers = scene.shapes.filter((shape) => shape.holdsContents || shape.collapsed);
      const shape = at(containers, edit.element);
      return (
        shape && {
          type: 'set-collapsed',
          view: VIEW,
          elements: [shape.element],
          collapsed: !(view.collapsed ?? []).includes(shape.element),
        }
      );
    }
    case 'expand':
    case 'undo':
      return undefined;
  }
}

describe('a scene with overlays and levels, built after an edit', () => {
  it('equals one built from nothing, whatever the edits and the containers expanded by zoom', () => {
    const sets = new Map<string, ReadonlySet<string>>();
    // The same set for the same ids, as the open app gives them.
    const expandedOf = (ids: readonly string[]): ReadonlySet<string> => {
      const key = [...ids].sort().join(' ');
      let set = sets.get(key);
      if (!set) {
        set = ids.length === 0 ? NOT_EXPANDED : new Set(ids);
        sets.set(key, set);
      }
      return set;
    };
    fc.assert(
      fc.property(fc.array(edit, { minLength: 1, maxLength: 20 }), (edits) => {
        let project = loadSample();
        let expanded = NOT_EXPANDED;
        let scene = buildScene(project, VIEW, expanded);
        const undos: ProjectSnapshot[] = [];
        for (const each of edits) {
          if (each.kind === 'undo') project = undos.pop() ?? project;
          else if (each.kind === 'expand') {
            const view = project.views.find((one) => one.id === VIEW) as ViewFile;
            const collapsed = view.collapsed ?? [];
            expanded = expandedOf(collapsed.filter((_, index) => (each.pick >> index) % 2 === 1));
          } else {
            const command = commandOf(each, project, scene);
            const outcome = command && executeCommand(project, command);
            if (!outcome?.ok) continue;
            undos.push(project);
            project = applyOperations(project, outcome.operations).state;
          }
          const before = scene;
          scene = buildScene(project, VIEW, expanded);
          expect(scene).toEqual(buildSceneAfresh(project, VIEW, expanded));
          const keys = new Map(before.shapes.map((shape) => [shape.key, shape]));
          for (const shape of scene.shapes) {
            const was = keys.get(shape.key);
            if (was && was !== shape) expect(was).not.toEqual(shape);
          }
          const indexed = indexScene(scene);
          const fresh = indexSceneAfresh(scene);
          expect([...indexed.bands]).toEqual([...fresh.bands]);
          expect(indexed.drawing).toEqual(fresh.drawing);
        }
      }),
      { numRuns: 60 },
    );
  }, 120_000);
});
