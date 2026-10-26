/**
 * Lines on shapes beyond boxes, in the scene (ADR 0066, ADR 0067, ADR 0069, ADR 0039's
 * clarification): automatic ends on outlines, orthogonal routes carried on to them, connection points
 * and border attachments carried in, parts of lines alone, automatic straight and curved lines
 * fanned apart, aggregated relations' styles, and the incremental scene routing again only the lines
 * whose ends or style changed, within the 50 ms an edit may take.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import type {
  Element,
  FreeGeometry,
  PackageFile,
  Relation,
  ShapePosition,
} from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { cpuNow } from '../../test/cpu';
import { TRIANGLE, beyondBoxes } from '../../test/beyond';
import type { Point } from '../geometry';
import { outlineAt, type PlacedOutline } from '../outlines';
import {
  buildScene,
  buildSceneAfresh,
  relationLinesOf,
  type ElementShape,
  type RelationLine,
  type Scene,
} from '../scene';
import { avoidedScene } from './avoided';
import { STUB } from './hand';
import { nearestOnOutline } from './outline-ends';
import { rerouted } from './scene-routes';

const VIEW = 'anatomy';
const NS = 'xmlns="http://www.w3.org/2000/svg"';
/** A picture of one nerve, a line 4 wide across it. */
const NERVES = `<svg viewBox="0 0 200 100" ${NS}><path id="vagus" d="M0 50H200" fill="none" stroke="#7D3C98" stroke-width="4"/></svg>`;

const element = (id: string, appearance?: Element['appearance']): Element => ({
  id,
  component: 'anatomy.chamber',
  name: id,
  ...(appearance ? { appearance } : {}),
});

const flows = (id: string, from: string, to: string, relationType = 'anatomy.flows'): Relation => ({
  id,
  relationType,
  from,
  to,
});

/**
 * The beyond-boxes fixture with more in World: a triangle `tri` and a box `box` beside it, related
 * twice, either way; a triangle `peak` with a connection point at its apex, related from `above`;
 * a nerve drawn as its part, related to `box`; and a container `room` whose two contents signal to
 * `box`, which aggregate when it is collapsed.
 */
function project(): ProjectSnapshot {
  const base = beyondBoxes(VIEW);
  const pkg = base.packages[0] as PackageFile;
  const packages: PackageFile[] = [
    {
      ...pkg,
      relationTypes: [
        ...(pkg.relationTypes ?? []),
        {
          id: 'anatomy.signals',
          name: 'signals',
          derivesFrom: 'relates-to',
          direction: 'directed',
          appearance: { route: 'curved' },
        },
      ],
      images: [
        ...(pkg.images ?? []),
        { kind: 'svg', id: 'anatomy.nerves', name: 'Nerves', width: 200, height: 100, svg: NERVES },
      ],
    },
  ];
  const elements: Element[] = [
    ...base.model.elements,
    element('tri', { geometry: TRIANGLE, width: 200, height: 100 }),
    element('box', { width: 160, height: 80 }),
    element('peak', {
      geometry: TRIANGLE,
      width: 200,
      height: 100,
      connectionPoints: [{ name: 'apex', side: 'top', at: 0.5 }],
    }),
    element('above', { width: 160, height: 80 }),
    element('nerve', { part: { part: 'vagus', image: 'anatomy.nerves' }, width: 200, height: 100 }),
    element('room'),
    element('a1'),
    element('a2'),
  ];
  const relations: Relation[] = [
    ...base.model.relations,
    flows('t1', 'tri', 'box'),
    flows('t2', 'box', 'tri'),
    flows('up', 'above', 'peak'),
    flows('n1', 'nerve', 'box'),
    { id: 'a1-in-room', relationType: 'anatomy.is-part-of', from: 'a1', to: 'room' },
    { id: 'a2-in-room', relationType: 'anatomy.is-part-of', from: 'a2', to: 'room' },
    flows('s1', 'a1', 'box', 'anatomy.signals'),
    flows('s2', 'a2', 'box', 'anatomy.signals'),
  ];
  const view = base.views[0] as (typeof base.views)[number];
  const positions: ShapePosition[] = [
    ...view.positions,
    { element: 'tri', x: 0, y: 600 },
    { element: 'box', x: 400, y: 610 },
    { element: 'peak', x: 0, y: 1000 },
    { element: 'above', x: 20, y: 800 },
    { element: 'nerve', x: 0, y: 1300 },
    { element: 'room', x: 800, y: 1000 },
  ];
  return {
    ...base,
    packages,
    model: { ...base.model, elements, relations },
    views: [{ ...view, positions }],
  };
}

function run(state: ProjectSnapshot, ...commands: Command[]): ProjectSnapshot {
  let next = state;
  for (const command of commands) {
    const outcome = executeCommand(next, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    next = outcome.state;
  }
  return next;
}

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

function lineOf(scene: Scene, relation: string): RelationLine {
  const line = relationLinesOf(scene).get(relation);
  if (!line) throw new Error(`No line for ${relation}`);
  return line;
}

function outlineOf(scene: Scene, key: string): PlacedOutline {
  const placed = outlineAt(shapeOf(scene, key));
  if (!placed) throw new Error(`No outline on ${key}`);
  return placed;
}

/** How far a point lies from a shape's outline. */
function offOutline(scene: Scene, key: string, point: Point): number {
  return nearestOnOutline(outlineOf(scene, key), point).distance;
}

function orthogonal(route: readonly Point[]): boolean {
  return route.every((point, at) => {
    const next = route[at + 1];
    return !next || point.x === next.x || point.y === next.y;
  });
}

/** How far a point is from the line through two others. */
function fromLine(point: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / Math.hypot(dx, dy);
}

const styled = (state: ProjectSnapshot, routeStyle: 'straight' | 'curved' | null) =>
  run(state, { type: 'update-view', id: VIEW, changes: { routeStyle } });

describe('automatic orthogonal lines on outlines', () => {
  it('attach on the outline, their end segments carried on from the box', () => {
    const scene = buildScene(project(), VIEW);
    for (const id of ['t1', 't2', 'tie']) {
      const line = lineOf(scene, id);
      expect(orthogonal(line.route), id).toBe(true);
    }
    const t1 = lineOf(scene, 't1');
    expect(offOutline(scene, 'tri', t1.from)).toBeLessThan(1e-6);
    // It leaves the triangle by the segment it crosses the box's right side by.
    expect(t1.route[1]?.y).toBe(t1.from.y);
    expect(t1.from.x).toBeLessThan(200);
    const tie = lineOf(scene, 'tie');
    expect(offOutline(scene, 'loose', tie.from)).toBeLessThan(1e-6);
    expect(offOutline(scene, 'framed', tie.to)).toBeLessThan(1e-6);
    expect(tie.arrowhead?.tip).toEqual(tie.to);
  });

  it('attach at a connection point carried in to the outline, leaving it by its stub', () => {
    const scene = buildScene(project(), VIEW);
    const up = lineOf(scene, 'up');
    // The apex of the triangle, at the middle of the box's top side.
    expect(up.to).toEqual({ x: 100, y: 1000 });
    // It comes in along the side's normal, its stub at least.
    expect(up.route.at(-2)?.x).toBe(100);
    expect(up.route.at(-2)?.y).toBeLessThanOrEqual(1000 - STUB);
  });

  it('attach a border place chosen by hand carried in from its side', () => {
    const routed = run(project(), {
      type: 'set-route',
      view: VIEW,
      relation: 't1',
      from: { kind: 'border', side: 'left', at: 0.5 },
    });
    const line = lineOf(buildScene(routed, VIEW), 't1');
    // The triangle's left side, at half its height: x = 37.5 + 62.5 × 0.5.
    expect(line.from.x).toBeCloseTo(68.75, 6);
    expect(line.from.y).toBe(650);
    expect(line.route[1]?.x).toBeCloseTo(68.75 - STUB, 6);
  });

  it('go around what is in their way by their boxes, and meet the outlines still', () => {
    const walled = run(
      project(),
      {
        type: 'create-element',
        element: { id: 'wall', component: 'anatomy.chamber', name: 'Wall' },
      },
      {
        type: 'set-positions',
        view: VIEW,
        positions: [{ element: 'wall', x: 260, y: 540, width: 60, height: 240 }],
      },
    );
    const scene = buildScene(walled, VIEW);
    const avoided = avoidedScene(scene);
    const before = lineOf(scene, 't1');
    const around = lineOf(avoided, 't1');
    expect(around.route).not.toEqual(before.route);
    expect(orthogonal(around.route)).toBe(true);
    expect(offOutline(avoided, 'tri', around.from)).toBeLessThan(1e-6);
    // On the box's border, a box being its own outline.
    const box = shapeOf(scene, 'box').rect;
    const { x, y } = around.to;
    const onSides = x === box.x || x === box.x + box.width;
    const onEnds = y === box.y || y === box.y + box.height;
    expect(onSides || onEnds).toBe(true);
    const wall = shapeOf(scene, 'wall').rect;
    expect(around.route.some((point) => point.y < wall.y || point.y > wall.y + wall.height)).toBe(
      true,
    );
  });

  it('attach a part of lines alone at its line’s point nearest the other end', () => {
    const scene = buildScene(project(), VIEW);
    const nerve = shapeOf(scene, 'nerve');
    expect(nerve.outline).toBeDefined();
    const line = lineOf(scene, 'n1');
    expect(offOutline(scene, 'nerve', line.from)).toBeLessThan(0.01);
    // Its right end, nearest the box, which lies to the right and above.
    expect(line.from.x).toBeGreaterThan(nerve.rect.x + 190);
    expect(orthogonal(line.route)).toBe(true);
  });
});

describe('automatic straight and curved lines on outlines', () => {
  it('run straight from where the line from each inner point last leaves the outline', () => {
    const scene = buildScene(styled(project(), 'straight'), VIEW);
    const tie = lineOf(scene, 'tie');
    expect(tie.style).toBe('straight');
    expect(tie.route).toHaveLength(2);
    expect(offOutline(scene, 'loose', tie.from)).toBeLessThan(1e-6);
    expect(offOutline(scene, 'framed', tie.to)).toBeLessThan(1e-6);
  });

  it('fan lines between the same two ends 24 apart, whichever way each runs', () => {
    const scene = buildScene(styled(project(), 'straight'), VIEW);
    const t1 = lineOf(scene, 't1');
    const t2 = lineOf(scene, 't2');
    expect(offOutline(scene, 'tri', t1.from)).toBeLessThan(1e-6);
    expect(offOutline(scene, 'tri', t2.to)).toBeLessThan(1e-6);
    // Parallel, 24 apart.
    expect(fromLine(t2.from, t1.from, t1.to)).toBeCloseTo(24, 6);
    expect(fromLine(t2.to, t1.from, t1.to)).toBeCloseTo(24, 6);
  });

  it('curve in one span from where the orthogonal route attaches, along the sides', () => {
    const scene = buildScene(styled(project(), 'curved'), VIEW);
    const t1 = lineOf(scene, 't1');
    const t2 = lineOf(scene, 't2');
    expect(t1.style).toBe('curved');
    expect(t1.curve).toHaveLength(1);
    const [span] = t1.curve ?? [];
    if (!span) throw new Error('No span');
    expect(offOutline(scene, 'tri', span.from)).toBeLessThan(1e-6);
    // Out of the right side, into the box's left side.
    expect(span.c1.y).toBe(span.from.y);
    expect(span.c1.x).toBeGreaterThan(span.from.x);
    expect(span.to.x).toBe(400);
    expect(span.c2.y).toBe(span.to.y);
    expect(span.c2.x).toBeLessThan(span.to.x);
    // At the box, the two lines attach 24 apart, so their curves fan apart.
    expect(Math.abs(t1.to.y - t2.from.y)).toBeCloseTo(24, 6);
    expect(scene).toEqual(buildSceneAfresh(styled(project(), 'curved'), VIEW));
  });

  it('take, aggregated, their relation type’s style, or else the view’s', () => {
    const collapsed = run(project(), {
      type: 'set-collapsed',
      view: VIEW,
      elements: ['room'],
      collapsed: true,
    });
    const scene = buildScene(collapsed, VIEW);
    const aggregated = lineOf(scene, 's1');
    expect(aggregated.aggregate?.relations).toEqual(['s1', 's2']);
    expect(aggregated.style).toBe('curved');
    expect(aggregated.curve).toHaveLength(1);
    // A relation type that sets no style leaves its aggregated lines to the view.
    const flowing = run(collapsed, {
      type: 'create-relation',
      relation: { relationType: 'anatomy.flows', from: 'a1', to: 'above' },
    });
    const straight = buildScene(styled(flowing, 'straight'), VIEW);
    const toAbove = straight.relations.find(
      (line) => line.aggregate?.relationType === 'anatomy.flows',
    );
    expect(toAbove?.style).toBe('straight');
    expect(lineOf(straight, 's1').style).toBe('curved');
  });
});

describe('lines on outlines while a shape is dragged', () => {
  it('are routed again on the outline where the drag has taken it', () => {
    for (const style of [null, 'curved'] as const) {
      const scene = buildScene(styled(project(), style), VIEW);
      const line = lineOf(scene, 't1');
      const tri = shapeOf(scene, 'tri');
      const box = shapeOf(scene, 'box');
      const moved = { ...tri.rect, x: tri.rect.x + 40, y: tri.rect.y - 30 };
      const routed = rerouted(line, { rect: moved }, { rect: box.rect }, tri, box);
      if (!routed) throw new Error('Not routed on the outline.');
      const start = routed.route[0] as Point;
      const placed = outlineAt({ rect: moved, outline: tri.outline });
      if (!placed) throw new Error('No outline');
      expect(nearestOnOutline(placed, start).distance, String(style)).toBeLessThan(1e-6);
      expect(routed.curve !== undefined, String(style)).toBe(style === 'curved');
    }
  });
});

describe('the incremental scene, on outlines', () => {
  it('routes again only the lines on a shape that moved', () => {
    const state = styled(project(), 'curved');
    const before = buildScene(state, VIEW);
    const moved = run(state, {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'tri', x: 0, y: 640 }],
    });
    const after = buildScene(moved, VIEW);
    const again = new Set(['t1', 't2']);
    for (const line of before.relations) {
      const now = after.relations.find((each) => each.relation === line.relation);
      if (again.has(line.relation)) expect(now).not.toBe(line);
      else expect(now, line.relation).toBe(line);
    }
    expect(offOutline(after, 'tri', lineOf(after, 't1').from)).toBeLessThan(1e-6);
    expect(after).toEqual(buildSceneAfresh(moved, VIEW));
  });

  it('routes a line again when its relation’s style changes, and only it', () => {
    const state = project();
    const before = buildScene(state, VIEW);
    const curved = run(state, {
      type: 'update-relation',
      id: 't1',
      changes: { appearanceTraits: { route: 'curved' } },
    });
    const after = buildScene(curved, VIEW);
    expect(lineOf(after, 't1').style).toBe('curved');
    for (const line of before.relations) {
      if (line.relation === 't1') continue;
      const now = after.relations.find((each) => each.relation === line.relation);
      expect(now, line.relation).toBe(line);
    }
    expect(after).toEqual(buildSceneAfresh(curved, VIEW));
  });

  it('applies a move of a shape with free geometry and 50 relations within 50 ms', () => {
    const state = hub(50);
    buildScene(state, VIEW);
    let worst = 0;
    let current = state;
    for (let step = 1; step <= 5; step++) {
      const started = cpuNow();
      current = run(current, {
        type: 'set-positions',
        view: VIEW,
        positions: [{ element: 'hub', x: 400 + step * 8, y: 400 + step * 8 }],
      });
      const scene = buildScene(current, VIEW);
      worst = Math.max(worst, cpuNow() - started);
      expect(scene.relations).toHaveLength(50);
    }
    expect(worst).toBeLessThan(50);
    const scene = buildScene(current, VIEW);
    for (const line of scene.relations) {
      const end =
        line.ends?.from.kind === 'shape' && line.ends.from.key === 'hub' ? line.from : line.to;
      expect(offOutline(scene, 'hub', end)).toBeLessThan(1e-6);
    }
  });
});

/** A heart, as ADR 0066 writes free geometry. */
const HEART: FreeGeometry = {
  width: 120,
  height: 110,
  keepProportions: true,
  outline: [
    {
      kind: 'path',
      d: 'M60 104 C20 76 0 52 0 30 C0 12 14 0 30 0 C44 0 54 8 60 20 C66 8 76 0 90 0 C106 0 120 12 120 30 C120 52 100 76 60 104 Z',
    },
  ],
};

/**
 * A view with a heart in the middle related to `count` boxes around it, a third of the relations
 * straight, a third curved and a third orthogonal.
 */
function hub(count: number): ProjectSnapshot {
  const base = project();
  const styles = ['straight', 'curved', undefined] as const;
  const elements: Element[] = [
    element('hub', { geometry: HEART, width: 240, height: 220 }),
    ...Array.from({ length: count }, (_, at) => element(`spoke-${at}`)),
  ];
  const relations: Relation[] = Array.from({ length: count }, (_, at) => {
    const style = styles[at % 3];
    return {
      ...flows(
        `spoke-to-hub-${at}`,
        at % 2 === 0 ? `spoke-${at}` : 'hub',
        at % 2 === 0 ? 'hub' : `spoke-${at}`,
      ),
      ...(style ? { appearance: { route: style } } : {}),
    };
  });
  const positions: ShapePosition[] = [
    { element: 'hub', x: 400, y: 400 },
    ...Array.from({ length: count }, (_, at): ShapePosition => {
      const angle = (2 * Math.PI * at) / count;
      return {
        element: `spoke-${at}`,
        x: Math.round(520 + 600 * Math.cos(angle)),
        y: Math.round(510 + 600 * Math.sin(angle)),
      };
    }),
  ];
  const view = base.views[0] as (typeof base.views)[number];
  return {
    ...base,
    model: { ...base.model, elements, relations },
    views: [{ ...view, positions }],
  };
}
