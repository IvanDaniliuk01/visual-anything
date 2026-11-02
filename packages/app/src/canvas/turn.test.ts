/**
 * A shape turned or mirrored in a view (ADR 0088, A6.3): what the scene carries, that the canvas and
 * the SVG draw its body turned and its name level, that pointing and marks read its turned outline,
 * that layout spaces it by its turned bounds, and that its lines end on its turned outline.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import { Graphics } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { writeSvg } from '../export/svg';
import { loadSample } from '../test/sample';
import { drawShapeOutlines } from './draw';
import { holdsAsDrawn, selectedBoxOf } from './hit';
import { tagReachOf } from './layout/input';
import { drawnBoundsOf } from './nameTags';
import { buildScene, type ElementShape } from './scene';
import {
  isTurned,
  levelBoxOf,
  turnedBounds,
  turnedOutlineOf,
  turnPoint,
  unturnPoint,
  type Turned,
} from './turn';
import { outlineHolds } from '@visual-anything/core';

const VIEW = 'system-overview';
const ELEMENT = 'appointments-api';
const sample = loadSample();

function shapeIn(project: ProjectSnapshot, element = ELEMENT): ElementShape {
  const shape = buildScene(project, VIEW).shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape for ${element}`);
  return shape;
}

/** The sample with the element's shape turned and mirrored as given, where it is now. */
function turned(
  change: { rotation?: number; flip?: 'horizontal' | 'vertical' | 'both' | 'none' },
  element = ELEMENT,
  project = sample,
): ProjectSnapshot {
  const shape = shapeIn(project, element);
  const outcome = executeCommand(project, {
    type: 'set-positions',
    view: VIEW,
    positions: [
      {
        element,
        ...(shape.container === undefined ? {} : { container: shape.container }),
        x: shape.offset.x,
        y: shape.offset.y,
        width: shape.rect.width,
        height: shape.rect.height,
        pinned: true,
        ...change,
      },
    ],
  });
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

const box = { x: 100, y: 200, width: 120, height: 40 };

describe('the turn', () => {
  it('turns a box about its middle, clockwise, and back', () => {
    const shape: Turned = { rect: box, rotation: 90 };
    expect(turnedBounds(shape)).toEqual({ x: 140, y: 160, width: 40, height: 120 });
    // Its top left lands at its top right, as a clockwise quarter turn on a screen takes it.
    expect(turnPoint(shape, { x: 100, y: 200 })).toEqual({ x: 180, y: 160 });
    const back = unturnPoint(shape, { x: 180, y: 160 });
    expect(back.x).toBeCloseTo(100);
    expect(back.y).toBeCloseTo(200);
    expect(levelBoxOf(shape)).toEqual({ x: 140, y: 160, width: 40, height: 120 });
    expect(levelBoxOf({ rect: box, rotation: 180 })).toBe(box);
  });

  it('mirrors in the shape’s own axes, keeping its bounds', () => {
    const shape: Turned = { rect: box, flip: 'horizontal' };
    expect(turnPoint(shape, { x: 100, y: 200 })).toEqual({ x: 220, y: 200 });
    expect(turnedBounds(shape)).toEqual(box);
    expect(turnPoint({ rect: box, flip: 'vertical' }, { x: 100, y: 200 })).toEqual({
      x: 100,
      y: 240,
    });
  });

  it('gives a box at an angle the bounds of its corners', () => {
    const bounds = turnedBounds({ rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 45 });
    expect(bounds.width).toBeCloseTo(100 * Math.SQRT2);
    expect(bounds.x).toBeCloseTo(50 - 50 * Math.SQRT2);
  });

  it('leaves a shape neither turned nor mirrored as it is', () => {
    expect(isTurned({})).toBe(false);
    expect(turnedBounds({ rect: box })).toBe(box);
  });
});

describe('the scene', () => {
  it('carries the turn and the mirroring of a shape’s position, and takes them away', () => {
    expect(isTurned(shapeIn(sample))).toBe(false);
    const project = turned({ rotation: 90, flip: 'horizontal' });
    const shape = shapeIn(project);
    expect(shape.rotation).toBe(90);
    expect(shape.flip).toBe('horizontal');
    const back = shapeIn(turned({ rotation: 0, flip: 'none' }, ELEMENT, project));
    expect(back.rotation).toBeUndefined();
    expect(back.flip).toBeUndefined();
  });

  it('never turns a container', () => {
    const container = buildScene(sample, VIEW).shapes.find((each) => each.holdsContents);
    if (!container) throw new Error('The sample has no container');
    const shape = shapeIn(turned({ rotation: 90 }, container.element), container.element);
    expect(shape.rotation).toBeUndefined();
  });

  it('covers its turned bounds, which its scene’s bounds hold', () => {
    const project = turned({ rotation: 90 });
    const shape = shapeIn(project);
    const bounds = turnedBounds(shape);
    expect(drawnBoundsOf(shape)).toEqual(bounds);
    expect(selectedBoxOf(shape)).toEqual(bounds);
    const scene = buildScene(project, VIEW);
    const all = scene.bounds as NonNullable<typeof scene.bounds>;
    expect(all.y).toBeLessThanOrEqual(bounds.y);
    expect(all.y + all.height).toBeGreaterThanOrEqual(bounds.y + bounds.height);
  });
});

describe('pointing', () => {
  it('holds what the turned body covers, and not what it turned away from', () => {
    const shape = shapeIn(turned({ rotation: 90 }));
    const { rect } = shape;
    expect(rect.width).toBeGreaterThan(rect.height);
    const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    // Above its middle, past its level top but within its turned length.
    const above = { x: middle.x, y: middle.y - rect.width / 2 + 2 };
    expect(holdsAsDrawn(shape, above, true)).toBe(true);
    expect(holdsAsDrawn(shape, above, false)).toBe(true);
    // At its level left end, which it turned away from.
    const left = { x: rect.x + 2, y: middle.y };
    expect(holdsAsDrawn(shape, left, true)).toBe(false);
    expect(holdsAsDrawn(shape, left, false)).toBe(false);
  });
});

describe('drawing', () => {
  it('draws the body through the turn and the name tag level', () => {
    const shape = shapeIn(turned({ rotation: 90 }));
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [shape]);
    const transforms = graphics.context.instructions.flatMap((each) => {
      const path = (
        each.data as {
          path?: { shapePath: { shapePrimitives: { transform?: { a: number; b: number } }[] } };
        }
      ).path;
      return path ? path.shapePath.shapePrimitives.map((primitive) => primitive.transform) : [];
    });
    expect(transforms.some((m) => m && Math.abs(m.b - 1) < 1e-9)).toBe(true);
  });

  it('draws a shape neither turned nor mirrored with no transform', () => {
    const graphics = new Graphics();
    drawShapeOutlines(graphics, [shapeIn(sample)]);
    const turnedAny = graphics.context.instructions.some((each) => {
      const path = (
        each.data as { path?: { shapePath: { shapePrimitives: { transform?: { b: number } }[] } } }
      ).path;
      return path?.shapePath.shapePrimitives.some(
        (primitive) => (primitive.transform?.b ?? 0) !== 0,
      );
    });
    expect(turnedAny).toBe(false);
  });

  it('writes the SVG body in a group that turns it, and its texts level', () => {
    const project = turned({ rotation: 90, flip: 'vertical' });
    const shape = shapeIn(project);
    const svg = new DOMParser().parseFromString(writeSvg(project, VIEW).text, 'image/svg+xml');
    const group = svg.querySelector(`[data-shape="${shape.key}"]`);
    if (!group) throw new Error('No group');
    const turnedGroup = group.querySelector('g[transform^="matrix("]');
    expect(turnedGroup).not.toBeNull();
    // Mirrored vertically, then turned clockwise by a quarter: (x, y) goes to (y, x) about the middle.
    expect(turnedGroup?.getAttribute('transform')).toMatch(/^matrix\(0 1 1 0 /);
    // The name is written outside the turned group, level.
    const texts = [...group.querySelectorAll('text')];
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) expect(turnedGroup?.contains(text)).toBe(false);
  });

  it('writes the same SVG for a shape whose turn was taken away', () => {
    const project = turned({ rotation: 90 });
    const back = turned({ rotation: 0 }, ELEMENT, project);
    const kept = turned({}, ELEMENT, sample);
    expect(writeSvg(back, VIEW).text).toBe(writeSvg(kept, VIEW).text);
  });
});

describe('layout and routing', () => {
  it('spaces a turned shape by its turned bounds', () => {
    const shape = shapeIn(turned({ rotation: 90 }));
    expect(tagReachOf(shapeIn(sample))).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
    const reach = tagReachOf(shape);
    const overhang = (shape.rect.width - shape.rect.height) / 2;
    expect(reach.top).toBeGreaterThanOrEqual(overhang);
    expect(reach.bottom).toBeGreaterThanOrEqual(overhang);
    expect(reach.left).toBe(0);
  });

  it('ends the shape’s lines on its turned outline', () => {
    const project = turned({ rotation: 45 });
    const scene = buildScene(project, VIEW);
    const shape = scene.shapes.find((each) => each.element === ELEMENT) as ElementShape;
    const outline = turnedOutlineOf(shape);
    const ends = scene.relations.flatMap((line) => {
      const points: { x: number; y: number }[] = [];
      if (line.ends?.from.kind === 'shape' && line.ends.from.key === shape.key) {
        points.push(line.route[0] as { x: number; y: number });
      }
      if (line.ends?.to.kind === 'shape' && line.ends.to.key === shape.key) {
        points.push(line.route.at(-1) as { x: number; y: number });
      }
      return points;
    });
    expect(ends.length).toBeGreaterThan(0);
    for (const end of ends) {
      const local = {
        x: end.x - shape.rect.x - outline.x,
        y: end.y - shape.rect.y - outline.y,
      };
      // On the turned outline: held within a unit of it, and not well inside it.
      expect(outlineHolds(outline.fitted, local, 1.5)).toBe(true);
      const level = unturnPoint(shape, end);
      const { rect } = shape;
      const inside =
        level.x > rect.x + 2 &&
        level.x < rect.x + rect.width - 2 &&
        level.y > rect.y + 2 &&
        level.y < rect.y + rect.height - 2;
      expect(inside).toBe(false);
    }
  });
});
