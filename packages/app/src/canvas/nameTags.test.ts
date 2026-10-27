/**
 * Name tags (ADR 0066's clarification of 2026-10-27): a shape whose own outline cannot hold its name
 * whole writes it in a tag hung under the outline, which is part of the shape. The tag's shape and
 * texts, pointing at it, box selection, the marks around the shape and its tag together, the lines
 * that reach the shape past its tag, layout spacing shapes with their tags, and their drawing.
 */
import { executeCommand, outlineHolds, type ProjectSnapshot } from '@visual-anything/core';
import type { Element, ViewFile } from '@visual-anything/schema';
import ELK from 'elkjs/lib/elk.bundled.js';
import { Container, Graphics, type TextStyleOptions } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { TRIANGLE, beyondBoxes } from '../test/beyond';
import { APEX_UP, OVAL, outlinedShape } from '../test/outlined';
import { readableTextColors } from './colors';
import { drawShapeBlocks, drawShapeOutlines, traceMark, writeShapeLabels } from './draw';
import type { TextFactory } from './draw';
import type { Point, Rect } from './geometry';
import { enclosedBy, hitAt, indexSceneAfresh, selectedBoxOf } from './hit';
import { layoutCommand } from './layout/command';
import { layOut } from './layout/engine';
import { layoutInput } from './layout/input';
import { LAYOUT_STEP } from './layout/types';
import {
  NAME_TAG_WIDTH,
  TAG_DETAIL_LINE,
  TAG_INSET,
  TAG_PADDING,
  drawnBoundsOf,
  markLinesWithTag,
  nameTagOf,
  nameTagOn,
  tagHolds,
  unionLines,
  type NameTag,
} from './nameTags';
import { PART_NAME_LINE, markContours, outlineBoundsOn, placedPoints } from './outlined';
import { shapeBorderPoint, type ShapeOutline } from './outlines';
import { automaticRoute, type AutomaticEnd } from './routing/automatic';
import { avoidShapesOf } from './routing/avoided';
import { carriedIn, endOutline, routeBoxOf } from './routing/outline-ends';
import { buildScene, type ElementShape, type RelationLine, type Scene } from './scene';

const VIEW = 'anatomy';
const VALVE = 'Pulmonary valve';

/**
 * The beyond-boxes fixture with a small valve drawn by a triangle, too small for its name, and a box
 * below it that it flows to, a little further down than its tag reaches.
 */
function tagged(view: Partial<ViewFile> = {}, valve: Partial<Element> = {}): ProjectSnapshot {
  const base = beyondBoxes(VIEW);
  const anatomy = base.views[0] as ViewFile;
  return {
    ...base,
    model: {
      ...base.model,
      elements: [
        ...base.model.elements,
        {
          id: 'valve',
          component: 'anatomy.chamber',
          name: VALVE,
          appearance: { geometry: TRIANGLE, width: 48, height: 32 },
          ...valve,
        },
        { id: 'below', component: 'anatomy.chamber', name: 'Below' },
      ],
      relations: [
        ...base.model.relations,
        { id: 'down', relationType: 'anatomy.flows', from: 'valve', to: 'below' },
      ],
    },
    views: [
      {
        ...anatomy,
        positions: [
          ...anatomy.positions,
          { element: 'valve', x: 400, y: 400, width: 48, height: 32 },
          { element: 'below', x: 376, y: 480, width: 96, height: 48 },
        ],
        ...view,
      },
    ],
  };
}

const shapeIn = (scene: Scene, key: string) =>
  scene.shapes.find((shape) => shape.key === key) as ElementShape;
const lineIn = (scene: Scene, id: string) =>
  scene.relations.find((line) => line.relation === id) as RelationLine;

/** A small triangle whose label area holds no name, named so that its tag holds a detail too. */
const small = (rect: Rect = { x: 100, y: 50, width: 48, height: 32 }, extra = {}) =>
  outlinedShape('valve', TRIANGLE, rect, { name: VALVE, componentName: 'Valve', ...extra });

/** Each shape of each fill and stroke a drawing makes, with the fill's or the stroke's color. */
function drawnShapes(graphics: Graphics) {
  return graphics.context.instructions.flatMap((each) => {
    const data = each.data as unknown as {
      style: { color: number };
      path?: { shapePath: { shapePrimitives: { shape: Record<string, unknown> }[] } };
    };
    const color = `#${data.style.color.toString(16).padStart(6, '0').toUpperCase()}`;
    return (data.path?.shapePath.shapePrimitives ?? []).map(({ shape }) => ({
      action: each.action,
      color,
      shape,
    }));
  });
}

/** Whether a segment passes through the inside of a rectangle, `inset` in from its sides. */
function crosses(a: Point, b: Point, rect: Rect, inset = 0.5): boolean {
  const inner = {
    x: rect.x + inset,
    y: rect.y + inset,
    width: rect.width - 2 * inset,
    height: rect.height - 2 * inset,
  };
  const steps = 64;
  for (let step = 0; step <= steps; step++) {
    const x = a.x + ((b.x - a.x) * step) / steps;
    const y = a.y + ((b.y - a.y) * step) / steps;
    if (x > inner.x && x < inner.x + inner.width && y > inner.y && y < inner.y + inner.height) {
      return true;
    }
  }
  return false;
}

/** Whether a route runs through a rectangle anywhere. */
function routeCrosses(route: readonly Point[], rect: Rect): boolean {
  for (let at = 1; at < route.length; at++) {
    if (crosses(route[at - 1] as Point, route[at] as Point, rect)) return true;
  }
  return false;
}

describe('nameTagOf', () => {
  it('hangs a tag under an outline that cannot hold its name whole, centred and touching it', () => {
    const shape = small();
    const tag = nameTagOf(shape) as NameTag;
    expect(tag).toBeDefined();
    const bounds = outlineBoundsOn(shape as ElementShape & { outline: ShapeOutline });
    const placed = nameTagOn(shape) as Rect;
    expect(placed.x + placed.width / 2).toBeCloseTo(bounds.x + bounds.width / 2);
    expect(placed.y).toBeCloseTo(bounds.y + bounds.height);
    // The name whole, on as many lines as it needs, with the detail under it.
    expect(tag.lines.join(' ')).toBe(VALVE);
    expect(tag.detail).toBe('Valve');
    expect(tag.height).toBeCloseTo(
      2 * TAG_PADDING + tag.lines.length * PART_NAME_LINE + TAG_DETAIL_LINE,
    );
    expect(tag.width).toBeLessThanOrEqual(NAME_TAG_WIDTH + 2 * TAG_INSET);
    expect(tag.width).toBeGreaterThan(2 * TAG_INSET);
    // A long name takes more lines, its words never cut.
    const long = {
      ...shape,
      name: 'The pulmonary valve between the right ventricle and the trunk',
    };
    const lines = (nameTagOf(long) as NameTag).lines;
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(long.name);
  });

  it('keeps the same tag for a shape that moves, placed where the shape is', () => {
    const shape = small();
    const moved = { ...shape, rect: { ...shape.rect, x: 700, y: 300 } };
    expect(nameTagOf(moved)).toBe(nameTagOf(shape));
    const before = nameTagOn(shape) as Rect;
    const after = nameTagOn(moved) as Rect;
    expect(after.x - before.x).toBeCloseTo(600);
    expect(after.y - before.y).toBeCloseTo(250);
    // Another name is another tag.
    expect(nameTagOf({ ...shape, name: 'Aortic valve' })).not.toBe(nameTagOf(shape));
  });

  it('holds its detail on one line, cut to its width, a collapsed container’s count first', () => {
    const long = small(undefined, { detail: 'Valve · semilunar · three cusps · no chordae' });
    const tag = nameTagOf(long) as NameTag;
    expect(tag.detail.endsWith('…')).toBe(true);
    const bare = small(undefined, { componentName: '' });
    expect((nameTagOf(bare) as NameTag).detail).toBe('');
    expect((nameTagOf(bare) as NameTag).height).toBeCloseTo(2 * TAG_PADDING + PART_NAME_LINE);
    const folded = small(undefined, { collapsed: { contents: 3 } });
    expect((nameTagOf(folded) as NameTag).detail).toBe('3 inside · Valve');
  });

  it('gives no tag to a shape that writes its name inside, an anchored part or a container showing its contents', () => {
    const large = outlinedShape('large', TRIANGLE, { x: 0, y: 0, width: 200, height: 160 });
    expect(nameTagOf(large)).toBeUndefined();
    expect(drawnBoundsOf(large)).toBe(large.rect);
    expect(nameTagOf(small(undefined, { holdsContents: true }))).toBeUndefined();
    const scene = buildScene(beyondBoxes(VIEW), VIEW);
    const anchored = shapeIn(scene, 'body/left');
    expect(anchored.part?.inDrawing).toBe(true);
    expect(nameTagOf({ ...anchored, name: 'A name far too long for any part' })).toBeUndefined();
  });

  it('hangs the tag of a drawing with parts that is no container under its box', () => {
    const scene = buildScene(beyondBoxes(VIEW), VIEW);
    const body = shapeIn(scene, 'body');
    expect(nameTagOf(body)).toBeUndefined();
    const drawing: ElementShape = { ...body, holdsContents: false };
    const placed = nameTagOn(drawing) as Rect;
    expect(placed).toBeDefined();
    expect(placed.y).toBeCloseTo(body.rect.y + body.rect.height);
    expect(placed.x + placed.width / 2).toBeCloseTo(body.rect.x + body.rect.width / 2);
  });
});

describe('pointing at a name tag', () => {
  it('finds its shape, drawn in full and as a plain block, and nothing beside it', () => {
    const scene = buildScene(tagged(), VIEW);
    const valve = shapeIn(scene, 'valve');
    const tag = nameTagOn(valve) as Rect;
    const indexed = indexSceneAfresh(scene);
    const middle = { x: tag.x + tag.width / 2, y: tag.y + tag.height / 2 };
    // The tag lies under the outline, beyond its rectangle.
    expect(middle.y).toBeGreaterThan(valve.rect.y + valve.rect.height);
    for (const exact of [true, false]) {
      const hit = hitAt(indexed, middle, 0, () => exact);
      expect(hit?.kind === 'shape' && hit.shape.key).toBe('valve');
    }
    expect(tagHolds(valve, { x: tag.x + 0.5, y: tag.y + tag.height / 2 })).toBe(true);
    expect(hitAt(indexed, { x: tag.x - 3, y: tag.y + tag.height / 2 }, 0)).toBeUndefined();
  });

  it('selects a shape with its tag by a box that holds both', () => {
    const scene = buildScene(tagged(), VIEW);
    const valve = shapeIn(scene, 'valve');
    const box = selectedBoxOf(valve);
    expect(box).toEqual(drawnBoundsOf({ ...valve, rect: valve.rect }));
    const indexed = indexSceneAfresh(scene);
    const around = { x: box.x - 1, y: box.y - 1, width: box.width + 2, height: box.height + 2 };
    expect(enclosedBy(indexed, around).shapes.map((shape) => shape.key)).toContain('valve');
    // A box around its outline alone leaves it out.
    const outline = outlineBoundsOn(valve as ElementShape & { outline: ShapeOutline });
    const tight = {
      x: outline.x - 1,
      y: outline.y - 1,
      width: outline.width + 2,
      height: outline.height + 2,
    };
    expect(enclosedBy(indexed, tight).shapes.map((shape) => shape.key)).not.toContain('valve');
  });
});

describe('marks around a shape and its tag', () => {
  it('trace the outline and the tag as one, never across the name', () => {
    const shape = small({ x: 0, y: 0, width: 48, height: 32 });
    const outline = shape.outline as ShapeOutline;
    const tag = nameTagOf(shape) as NameTag;
    const gap = 3;
    const lines = markLinesWithTag(
      tag,
      () =>
        markContours(outline.fitted, gap).map((contour) =>
          Float64Array.from(placedPoints(contour, outline.x, outline.y)),
        ),
      gap,
    );
    expect(lines.length).toBeGreaterThan(0);
    let lowest = -Infinity;
    let highest = Infinity;
    for (const line of lines) {
      for (let at = 0; at < line.points.length; at += 2) {
        const x = line.points[at] as number;
        const y = line.points[at + 1] as number;
        lowest = Math.max(lowest, y);
        highest = Math.min(highest, y);
        // Never inside the tag nor the outline.
        const inTag = x > tag.x && x < tag.x + tag.width && y > tag.y && y < tag.y + tag.height;
        expect(inTag).toBe(false);
        expect(outlineHolds(outline.fitted, { x: x - outline.x, y: y - outline.y })).toBe(false);
      }
    }
    // Around both: below the tag and above the outline, the gap away.
    expect(lowest).toBeCloseTo(tag.y + tag.height + gap, 1);
    expect(highest).toBeLessThan(outline.y + outline.fitted.bounds.y);
    // Kept for the tag and the gap.
    expect(markLinesWithTag(tag, () => [], gap)).toBe(lines);
  });

  it('are the boundary of what a polygon and a box cover together', () => {
    const square = Float64Array.from([0, 0, 10, 0, 10, 10, 0, 10]);
    const lines = unionLines([square], { x: 5, y: 5, width: 10, height: 10 });
    let length = 0;
    for (const line of lines) {
      const points = line.points;
      const count = points.length / 2;
      const segments = line.closed ? count : count - 1;
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % count;
        length += Math.hypot(
          (points[2 * j] as number) - (points[2 * i] as number),
          (points[2 * j + 1] as number) - (points[2 * i + 1] as number),
        );
      }
    }
    // Two squares of 10, overlapping by a square of 5: 40 + 40 - 4 × 5.
    expect(length).toBeCloseTo(60);
    // A polygon the box does not reach stays closed, and so does the box.
    const apart = unionLines([square], { x: 20, y: 20, width: 5, height: 5 });
    expect(apart.map((line) => line.closed)).toEqual([true, true]);
  });

  it('are drawn as lines by `traceMark`, for a shape given whole', () => {
    const shape = small();
    const graphics = new Graphics();
    traceMark(graphics, shape, 3);
    graphics.stroke({ color: 0, width: 1 });
    const placed = nameTagOn(shape) as Rect;
    const ys = drawnShapes(graphics).flatMap(({ shape: primitive }) => {
      const points = (primitive.points as number[] | undefined) ?? [];
      return points.filter((_, at) => at % 2 === 1);
    });
    expect(Math.max(...ys)).toBeCloseTo(placed.y + placed.height + 3, 1);
  });
});

describe('lines that reach a shape with a name tag', () => {
  it('attach where they last leave the outline and the tag together', () => {
    const shape = small();
    const tag = nameTagOn(shape) as Rect;
    const inside = { x: shape.rect.x + 24, y: shape.rect.y + 20 };
    const below = shapeBorderPoint(shape, inside, { x: inside.x, y: 400 });
    expect(below.y).toBeCloseTo(tag.y + tag.height);
    const above = shapeBorderPoint(shape, inside, { x: inside.x, y: -400 });
    expect(above.y).toBeLessThan(shape.rect.y + 16);
  });

  it('reach it past its tag, in every automatic style, never across the name', () => {
    for (const routeStyle of [undefined, 'straight', 'curved'] as const) {
      const scene = buildScene(tagged(routeStyle ? { routeStyle } : {}), VIEW);
      const valve = shapeIn(scene, 'valve');
      const tag = nameTagOn(valve) as Rect;
      const { route } = lineIn(scene, 'down');
      expect(route[0]?.y, String(routeStyle)).toBeCloseTo(tag.y + tag.height, 1);
      expect(routeCrosses(route, tag), String(routeStyle)).toBe(false);
    }
  });

  it('attach on the tag’s bottom by hand where the tag lies in the way, and on the outline beside it', () => {
    const scene = buildScene(
      tagged({ routes: { down: { from: { kind: 'border', side: 'bottom', at: 0.5 } } } }),
      VIEW,
    );
    const valve = shapeIn(scene, 'valve');
    const tag = nameTagOn(valve) as Rect;
    const { route } = lineIn(scene, 'down');
    expect(route[0]?.y).toBeCloseTo(tag.y + tag.height);
    expect(route[0]?.x).toBeCloseTo(valve.rect.x + valve.rect.width / 2);
    expect(routeCrosses(route, tag)).toBe(false);
    // A wide outline with a short name: beside its tag, a place on its bottom meets its outline.
    const wide = outlinedShape('Gill', APEX_UP, { x: 0, y: 0, width: 400, height: 16 });
    const wideTag = nameTagOn(wide) as Rect;
    expect(wideTag.width).toBeLessThan(200);
    const outline = endOutline(wide, wide.rect);
    expect(outline).toBeDefined();
    const middle = carriedIn(outline as NonNullable<typeof outline>, wide.rect, 'bottom', 0.5);
    expect(middle.point.y).toBeCloseTo(wideTag.y + wideTag.height);
    const aside = carriedIn(outline as NonNullable<typeof outline>, wide.rect, 'bottom', 0.05);
    expect(aside.point.x).toBeCloseTo(20);
    expect(aside.point.y).toBeCloseTo(16);
  });

  it('join shapes over both where their tags bring them together, never across a name', () => {
    const above = small({ x: 0, y: 0, width: 48, height: 32 });
    const tag = nameTagOn(above) as Rect;
    const below = outlinedShape(
      'below',
      OVAL,
      { x: 0, y: tag.y + tag.height + 10, width: 48, height: 48 },
      { name: 'B' },
    );
    expect(nameTagOf(below)).toBeUndefined();
    const end = (shape: ElementShape): AutomaticEnd => {
      const outline = endOutline(shape, shape.rect);
      if (!outline) throw new Error(`No outline on ${shape.key}`);
      return { end: { rect: routeBoxOf(shape, shape.rect) }, outline };
    };
    // Ten units apart with the tag: a flow from one into the other, as touching parts are joined.
    const { route } = automaticRoute(end(above), end(below), 'orthogonal', 0);
    expect(route).toHaveLength(2);
    expect(route[0]?.y).toBeCloseTo(tag.y + tag.height);
    expect(route[1]?.y).toBeGreaterThan(below.rect.y);
    expect(routeCrosses(route, tag)).toBe(false);
  });

  it('go around the tag, which the avoider reads as part of its shape', () => {
    const scene = buildScene(tagged(), VIEW);
    const at = scene.shapes.findIndex((shape) => shape.key === 'valve');
    const { rects } = avoidShapesOf(scene.shapes).shapes;
    const box = drawnBoundsOf(scene.shapes[at] as ElementShape);
    expect([...rects.slice(at * 4, at * 4 + 4)]).toEqual([box.x, box.y, box.width, box.height]);
  });

  it('are routed again when a rename changes the tag', () => {
    const project = tagged();
    const before = buildScene(project, VIEW);
    const renamed = executeCommand(project, {
      type: 'update-element',
      id: 'valve',
      changes: { name: 'The pulmonary valve, between the right ventricle and the trunk' },
    });
    if (!renamed.ok) throw new Error(JSON.stringify(renamed));
    const after = buildScene(renamed.state, VIEW);
    const tag = nameTagOn(shapeIn(after, 'valve')) as Rect;
    expect(tag.height).toBeGreaterThan((nameTagOn(shapeIn(before, 'valve')) as Rect).height);
    expect(lineIn(after, 'down').route[0]?.y).toBeCloseTo(tag.y + tag.height, 1);
  });
});

describe('layout', () => {
  it('spaces a shape by the box that holds its tag, on the step', () => {
    const project = tagged();
    const scene = buildScene(project, VIEW);
    const valve = shapeIn(scene, 'valve');
    const tag = nameTagOn(valve) as Rect;
    const input = layoutInput(scene, project, { kind: 'view' });
    const laid = input?.shapes.find((shape) => shape.key === 'valve');
    expect(laid).toBeDefined();
    const left = laid?.tagLeft ?? 0;
    expect(left % LAYOUT_STEP).toBe(0);
    expect(left).toBeGreaterThanOrEqual(valve.rect.x - tag.x);
    expect(laid?.x).toBe(valve.offset.x - left);
    expect((laid?.width ?? 0) - left).toBeGreaterThanOrEqual(tag.x + tag.width - valve.rect.x);
    expect(laid?.height).toBeGreaterThanOrEqual(tag.y + tag.height - valve.rect.y);
    expect(((laid?.width ?? 0) - valve.rect.width) % LAYOUT_STEP).toBe(0);
  });

  it('lays shapes out so that their tags overlap nothing beside them', async () => {
    const project = tagged({}, {});
    const scene = buildScene(project, VIEW);
    const input = layoutInput(scene, project, { kind: 'view' });
    if (!input) throw new Error('Nothing to lay out');
    const result = await layOut(input, new ELK());
    const valve = result.shapes.find((shape) => shape.key === 'valve');
    expect((valve?.x ?? 1) % LAYOUT_STEP).toBe(0);
    const action = layoutCommand(project, VIEW, scene, { kind: 'view' }, result.shapes);
    if (!action) throw new Error('Layout moved nothing');
    const applied = executeCommand(project, action.command);
    if (!applied.ok) throw new Error(JSON.stringify(applied));
    const laidOut = buildScene(applied.state, VIEW);
    const world = laidOut.shapes.filter((shape) => shape.containerShape === undefined);
    const drawn = shapeIn(laidOut, 'valve');
    const box = drawnBoundsOf(drawn);
    for (const other of world) {
      if (other.key === 'valve') continue;
      const rect = drawnBoundsOf(other);
      const apart =
        rect.x >= box.x + box.width ||
        box.x >= rect.x + rect.width ||
        rect.y >= box.y + box.height ||
        box.y >= rect.y + rect.height;
      expect(apart, other.key).toBe(true);
    }
  });
});

describe('drawing a name tag', () => {
  const placed: TextFactory = (options, kind, room) => {
    const label = new Container();
    label.label = `${kind}:${String(options.text)}`;
    label.position.set(options.x ?? 0, options.y ?? 0);
    (label as Container & { room?: number }).room = room;
    (label as Container & { style?: TextStyleOptions }).style = options.style as TextStyleOptions;
    return label;
  };

  it('draws a rounded rectangle in the shape’s fill and stroke, under its outline', () => {
    const shape = small();
    const tag = nameTagOn(shape) as Rect;
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [shape]);
    const rounded = drawnShapes(graphics).filter((each) => each.shape.type === 'roundedRectangle');
    const fill = rounded.find((each) => each.action === 'fill');
    expect(fill?.color).toBe(shape.fill);
    expect(fill?.shape).toMatchObject({
      x: tag.x,
      y: tag.y,
      width: tag.width,
      height: tag.height,
    });
    expect(rounded.some((each) => each.action === 'stroke')).toBe(true);
  });

  it('draws the tag as a block far out', () => {
    const shape = small();
    const tag = nameTagOn(shape) as Rect;
    const graphics = new Graphics();
    drawShapeBlocks(graphics, [shape]);
    const rects = drawnShapes(graphics)
      .filter((each) => each.action === 'fill' && each.shape.type === 'rectangle')
      .map((each) => each.shape);
    expect(rects.some((rect) => rect.y === tag.y && rect.height === tag.height)).toBe(true);
  });

  it('writes the name whole in the tag and the detail under it, in colors that read on the fill', () => {
    const shape = small();
    const tag = nameTagOn(shape) as Rect;
    const written = writeShapeLabels([shape], true, placed);
    expect(written.map((label) => label.label)).toEqual([`name:${VALVE}`, 'detail:Valve']);
    const [name, detail] = written as [Container, Container];
    expect(name.x).toBeCloseTo(tag.x + tag.width / 2);
    expect(name.y).toBeCloseTo(tag.y + TAG_PADDING);
    expect(detail.y).toBeGreaterThan(name.y);
    expect(detail.y + TAG_DETAIL_LINE).toBeLessThanOrEqual(tag.y + tag.height);
    expect((name as Container & { style: TextStyleOptions }).style.fill).toBe(
      readableTextColors(shape.fill).name,
    );
  });
});
