/**
 * Layout and callouts around a solid's picture (M15.4, ADR 0091): layout stores each callout where
 * the scene puts it beside its part, arranges the drawing's other contents below the picture and the
 * callouts, and keeps a callout pinned by hand; and the robot-arm sample's "Structure" view, laid
 * out, reads: every motor and encoder beside its joint, none on another, none over the arm.
 */
import { executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { CALLOUTS, withCallouts } from '../../test/solids';
import { loadSample } from '../../test/sample';
import type { Rect } from '../geometry';
import { buildScene, type ElementShape, type Scene } from '../scene';
import { layoutCommand } from './command';
import { layOut } from './engine';
import { layoutInput, type LayoutScope } from './input';

const elk = new ELK();

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

/** Lays out a view as the app does and applies what layout gives. */
async function laidOut(project: ProjectSnapshot, view: string, scope: LayoutScope) {
  const scene = buildScene(project, view);
  const input = layoutInput(scene, project, scope);
  if (!input) return { project, scene, input };
  const result = await layOut(input, elk);
  const action = layoutCommand(project, view, scene, scope, result.shapes);
  if (!action) return { project, scene, input, result };
  const outcome = executeCommand(project, action.command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return { project: outcome.state, scene: buildScene(outcome.state, view), input, result };
}

describe('layout and callouts (ADR 0091)', () => {
  it('keeps each callout where the scene puts it, and gives that back as where it goes', async () => {
    const state = withCallouts('robot');
    const before = buildScene(state, 'robot');
    const { input, result } = await laidOut(state, 'robot', { kind: 'view' });
    for (const id of CALLOUTS) {
      const laid = input?.shapes.find((shape) => shape.key === `arm/${id}`);
      expect(laid?.free).toBe(false);
      expect(laid?.callout).toBe(true);
      const at = shapeOf(before, `arm/${id}`).callout?.at;
      expect(result?.shapes.find((shape) => shape.key === `arm/${id}`)).toMatchObject({
        container: 'arm',
        ...at,
      });
    }
  });

  it('arranges the other contents below the picture and the callouts', async () => {
    const { scene, input } = await laidOut(withCallouts('robot'), 'robot', { kind: 'view' });
    const drawing = input?.shapes.find((shape) => shape.key === 'arm');
    const lowest = Math.max(
      ...CALLOUTS.map((id) => input?.shapes.find((shape) => shape.key === `arm/${id}`)).map(
        (shape) => (shape?.y ?? 0) + (shape?.height ?? 0),
      ),
    );
    expect(drawing?.pictureBottom).toBeGreaterThanOrEqual(lowest);
    const arm = shapeOf(scene, 'arm');
    const extra = shapeOf(scene, 'arm/extra');
    expect(extra.rect.y - arm.rect.y).toBeGreaterThanOrEqual(lowest);
    const picture = arm.picture?.rect as Rect;
    const rects = CALLOUTS.map((id) => shapeOf(scene, `arm/${id}`).rect);
    for (const [at, rect] of rects.entries()) {
      expect(overlap(rect, picture)).toBe(false);
      expect(overlap(rect, extra.rect)).toBe(false);
      for (const other of rects.slice(at + 1)) expect(overlap(rect, other)).toBe(false);
    }
  });

  it('keeps a callout pinned by hand where it is', async () => {
    const pinned = executeCommand(withCallouts('robot'), {
      type: 'set-positions',
      view: 'robot',
      positions: [{ element: 'm-base', container: 'arm', x: 640, y: 720, pinned: true }],
    });
    if (!pinned.ok) throw new Error('Not pinned.');
    const { input, result } = await laidOut(pinned.state, 'robot', { kind: 'view' });
    expect(input?.shapes.find((shape) => shape.key === 'arm/m-base')?.callout).toBeUndefined();
    expect(result?.shapes.some((shape) => shape.key === 'arm/m-base')).toBe(false);
  });
});

describe('the robot-arm sample “Structure” view, laid out (ADR 0091)', () => {
  const sample = loadSample('robot-arm');
  const MOVERS = [1, 2, 3, 4, 5, 6].flatMap((n) => [`motor-${n}`, `encoder-${n}`]);

  it('stands every motor and encoder beside its joint, none on another, none over the arm', async () => {
    const { scene } = await laidOut(sample, 'structure', { kind: 'view' });
    const arm = shapeOf(scene, 'arm');
    const picture = arm.picture?.rect as Rect;
    const rects = MOVERS.map((id) => {
      const shape = shapeOf(scene, `arm/${id}`);
      expect(shape.callout?.part, id).toBe(`joint-${id.split('-')[1]}`);
      return shape.rect;
    });
    for (const [at, rect] of rects.entries()) {
      expect(overlap(rect, picture), MOVERS[at]).toBe(false);
      for (const other of rects.slice(at + 1)) expect(overlap(rect, other)).toBe(false);
    }
    // Their lines enter the picture only in their last segment.
    for (const line of scene.relations.filter((each) =>
      /-(drives|senses)-joint-/.test(each.relation),
    )) {
      expect(line.callout, line.relation).toBe(true);
      expect(line.label).toBeUndefined();
      for (const bend of line.route.slice(0, -1)) {
        const inside =
          bend.x > picture.x &&
          bend.x < picture.x + picture.width &&
          bend.y > picture.y &&
          bend.y < picture.y + picture.height;
        expect(inside, line.relation).toBe(false);
      }
    }
  });

  it('is stored laid out so: the sample as shipped already reads', () => {
    const scene = buildScene(sample, 'structure');
    const picture = shapeOf(scene, 'arm').picture?.rect as Rect;
    const rects = MOVERS.map((id) => shapeOf(scene, `arm/${id}`).rect);
    for (const [at, rect] of rects.entries()) {
      expect(overlap(rect, picture), MOVERS[at]).toBe(false);
      for (const other of rects.slice(at + 1)) expect(overlap(rect, other)).toBe(false);
    }
  });
});
