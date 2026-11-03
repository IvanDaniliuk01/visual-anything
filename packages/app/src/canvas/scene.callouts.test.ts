/**
 * Callouts around a solid's picture (M15.4, ADR 0091): the contents of a drawing with parts that
 * relate to its anchored parts stand around the picture, beside their parts, none on another; their
 * lines run outside the picture but for their last segment and write their names only on hover and
 * selection; everything else is placed as before.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import { describe, expect, it } from 'vitest';
import { CALLOUTS, withCallouts, withSolids } from '../test/solids';
import { svgOfScene } from '../export/svg';
import { CALLOUT_GAP, MAX_CALLOUTS } from './callouts';
import type { Rect } from './geometry';
import { pageScene } from './routing/avoided';
import { buildScene, buildSceneAfresh, type ElementShape, type Scene } from './scene';

const VIEW = 'robot';

const overlap = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

function shapeOf(scene: Scene, key: string): ElementShape {
  const found = scene.shapes.find((shape) => shape.key === key);
  if (!found) throw new Error(`No shape ${key}`);
  return found;
}

function changed(state: ProjectSnapshot, command: Command): ProjectSnapshot {
  const outcome = executeCommand(state, command);
  if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
  return outcome.state;
}

describe('callouts around a solid picture (ADR 0091)', () => {
  it('makes a callout of each content that relates to an anchored part, either way', () => {
    const scene = buildScene(withCallouts(VIEW), VIEW);
    for (const id of CALLOUTS) expect(shapeOf(scene, `arm/${id}`).callout).toBeDefined();
    expect(shapeOf(scene, 'arm/m-base').callout?.part).toBe('base');
    expect(shapeOf(scene, 'arm/sees').callout?.part).toBe('gripper');
    // Neither an anchored part, nor a content that relates to none.
    expect(shapeOf(scene, 'arm/base').callout).toBeUndefined();
    expect(shapeOf(scene, 'arm/extra').callout).toBeUndefined();
    expect(shapeOf(scene, 'arm/twin').callout).toBeUndefined();
  });

  it('places the callouts around the picture, outside it, none on another', () => {
    const scene = buildScene(withCallouts(VIEW), VIEW);
    const arm = shapeOf(scene, 'arm');
    const picture = arm.picture?.rect as Rect;
    const rects = CALLOUTS.map((id) => shapeOf(scene, `arm/${id}`).rect);
    for (const [at, rect] of rects.entries()) {
      expect(overlap(rect, picture)).toBe(false);
      for (const other of rects.slice(at + 1)) expect(overlap(rect, other)).toBe(false);
      // Inside the drawing.
      expect(rect.x).toBeGreaterThanOrEqual(arm.rect.x);
      expect(rect.y).toBeGreaterThanOrEqual(arm.rect.y);
      expect(rect.x + rect.width).toBeLessThanOrEqual(arm.rect.x + arm.rect.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(arm.rect.y + arm.rect.height);
    }
  });

  it('stands each callout just outside the picture, beside its part', () => {
    const scene = buildScene(withCallouts(VIEW), VIEW);
    const picture = shapeOf(scene, 'arm').picture?.rect as Rect;
    for (const id of CALLOUTS) {
      const rect = shapeOf(scene, `arm/${id}`).rect;
      const gaps = {
        left: picture.x - (rect.x + rect.width),
        right: rect.x - (picture.x + picture.width),
        top: picture.y - (rect.y + rect.height),
        bottom: rect.y - (picture.y + picture.height),
      };
      const [side, gap] = Object.entries(gaps).sort((a, b) => b[1] - a[1])[0] as [string, number];
      // Within a step of the gap, rounded to layout's step.
      expect(Math.abs(gap - CALLOUT_GAP), id).toBeLessThanOrEqual(8);
      // Beside its part: across from the part's point along its side, or as near as spacing allows.
      const part = shapeOf(scene, `arm/${shapeOf(scene, `arm/${id}`).callout?.part}`).part?.point;
      if (!part) throw new Error('No point.');
      const level = side === 'left' || side === 'right' ? part.y : part.x;
      const start = side === 'left' || side === 'right' ? rect.y : rect.x;
      const length = side === 'left' || side === 'right' ? rect.height : rect.width;
      expect(Math.abs(level - (start + length / 2)), id).toBeLessThan(picture.width);
    }
  });

  it('stands a lone callout level with its part’s point, so that its line runs straight in', () => {
    const base = withSolids(VIEW);
    const state: ProjectSnapshot = {
      ...base,
      model: {
        ...base.model,
        relations: [
          ...base.model.relations,
          { id: 'extra-drives-base', relationType: 'robotics.drives', from: 'extra', to: 'base' },
        ],
      },
    };
    const scene = buildScene(state, VIEW);
    const line = scene.relations.find((each) => each.relation === 'extra-drives-base');
    expect(line?.route).toHaveLength(2);
    expect(line?.route.at(-1)).toEqual(shapeOf(scene, 'arm/base').part?.point);
  });

  it('places the other contents below the picture and the callouts', () => {
    const scene = buildScene(withCallouts(VIEW), VIEW);
    const picture = shapeOf(scene, 'arm').picture?.rect as Rect;
    const lowest = Math.max(
      picture.y + picture.height,
      ...CALLOUTS.map((id) => {
        const { rect } = shapeOf(scene, `arm/${id}`);
        return rect.y + rect.height;
      }),
    );
    expect(shapeOf(scene, 'arm/extra').rect.y).toBeGreaterThan(lowest);
  });

  it('gives layout where each callout goes, as positions are stored, on the step', () => {
    const scene = buildScene(withCallouts(VIEW), VIEW);
    const arm = shapeOf(scene, 'arm');
    for (const id of CALLOUTS) {
      const shape = shapeOf(scene, `arm/${id}`);
      const at = shape.callout?.at as { x: number; y: number };
      expect(at.x % 8).toBe(0);
      expect(at.y % 8).toBe(0);
      // Placed there while the view stores no position for it.
      expect(shape.rect.x - arm.rect.x).toBe(at.x);
      expect(shape.rect.y - arm.rect.y).toBe(at.y);
    }
  });

  it('keeps a callout where the view stores it, pinned by hand', () => {
    const state = changed(withCallouts(VIEW), {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'm-base', container: 'arm', x: 600, y: 700, pinned: true }],
    });
    const scene = buildScene(state, VIEW);
    const shape = shapeOf(scene, 'arm/m-base');
    const arm = shapeOf(scene, 'arm');
    expect(shape.rect.x - arm.rect.x).toBe(600);
    expect(shape.rect.y - arm.rect.y).toBe(700);
    expect(shape.callout).toBeDefined();
  });

  it('runs a callout line outside the picture but for its last segment, to the part point', () => {
    const scene = buildScene(withCallouts(VIEW), VIEW);
    const picture = shapeOf(scene, 'arm').picture?.rect as Rect;
    const inside = (p: { x: number; y: number }) =>
      p.x > picture.x &&
      p.x < picture.x + picture.width &&
      p.y > picture.y &&
      p.y < picture.y + picture.height;
    for (const [from, to] of [
      ['m-base', 'base'],
      ['m-link', 'link'],
      ['m-tip', 'wrist'],
    ] as const) {
      const line = scene.relations.find((each) => each.relation === `${from}-drives-${to}`);
      expect(line?.callout).toBe(true);
      const route = line?.route ?? [];
      const point = shapeOf(scene, `arm/${to}`).part?.point;
      expect(route.at(-1)).toEqual(point);
      for (const bend of route.slice(0, -1)) expect(inside(bend)).toBe(false);
    }
    // A line from the part to its callout runs the other way.
    const back = scene.relations.find((each) => each.relation === 'gripper-drives-sees');
    expect(back?.callout).toBe(true);
    expect(back?.route[0]).toEqual(shapeOf(scene, 'arm/gripper').part?.point);
  });

  it('writes a callout line name only on hover and selection', () => {
    const scene = buildScene(withCallouts(VIEW), VIEW);
    const line = scene.relations.find((each) => each.relation === 'm-base-drives-base');
    expect(line?.label).toBeUndefined();
    expect(line?.quietLabel).toBe('Torque');
    const back = scene.relations.find((each) => each.relation === 'gripper-drives-sees');
    expect(back?.label).toBeUndefined();
    expect(back?.quietLabel).toBe('Angle');
  });

  it('leaves a drawing without callouts as it was', () => {
    const before = buildScene(withSolids(VIEW), VIEW);
    expect(before.shapes.some((shape) => shape.callout !== undefined)).toBe(false);
    expect(shapeOf(before, 'arm').picture?.rect).toEqual({ x: 24, y: 48, width: 320, height: 320 });
    const line = before.relations.find((each) => each.relation === 'holds');
    expect(line?.callout).toBeUndefined();
  });

  it('builds the same scene incrementally as afresh as relations come and go', () => {
    const state = withCallouts(VIEW);
    buildScene(state, VIEW);
    const less = changed(state, {
      type: 'update-relation',
      id: 'm-link-drives-link',
      changes: { to: 'm-base' },
    });
    const after = buildScene(less, VIEW);
    const afresh = buildSceneAfresh(less, VIEW);
    expect(shapeOf(after, 'arm/m-link').callout).toBeUndefined();
    expect(after.shapes.map((shape) => [shape.key, shape.rect, shape.callout])).toEqual(
      afresh.shapes.map((shape) => [shape.key, shape.rect, shape.callout]),
    );
  });

  it('places at most MAX_CALLOUTS callouts, the contents past them below the picture as before', () => {
    const base = withCallouts(VIEW);
    const model = base.model;
    const template = model.elements.find((each) => each.id === 'm-base');
    const inArm = model.relations.find((each) => each.from === 'm-base' && each.to === 'arm');
    const drives = model.relations.find((each) => each.id === 'm-base-drives-base');
    if (!template || !inArm || !drives) throw new Error('No callout to copy.');
    const more = Array.from({ length: MAX_CALLOUTS }, (_, at) => `more-${at}`);
    const state: ProjectSnapshot = {
      ...base,
      model: {
        ...model,
        elements: [...model.elements, ...more.map((id) => ({ ...template, id, name: id }))],
        relations: [
          ...model.relations,
          ...more.flatMap((id) => [
            { ...inArm, id: `${id}-in-arm`, from: id },
            { ...drives, id: `${id}-drives-base`, from: id, name: undefined },
          ]),
        ],
      },
    };
    const started = performance.now();
    const scene = buildScene(state, VIEW);
    // Well within a frame's worth of work for the placement itself, on a weak laptop too.
    expect(performance.now() - started).toBeLessThan(5000);
    const keys = [...CALLOUTS, ...more].map((id) => `arm/${id}`);
    const shapes = keys.map((key) => shapeOf(scene, key));
    expect(shapes.filter((shape) => shape.callout !== undefined)).toHaveLength(MAX_CALLOUTS);
    // The first ones, in the model's order, are callouts; the rest lie below the picture.
    expect(shapes.slice(0, MAX_CALLOUTS).every((shape) => shape.callout !== undefined)).toBe(true);
    const picture = shapeOf(scene, 'arm').picture?.rect as Rect;
    for (const shape of shapes.slice(MAX_CALLOUTS)) {
      expect(shape.callout).toBeUndefined();
      expect(shape.rect.y).toBeGreaterThan(picture.y + picture.height);
    }
  });

  it('keeps the callouts’ lines as they run on the read-only page and in the SVG, without their names', () => {
    const state = withCallouts(VIEW);
    const scene = buildScene(state, VIEW);
    const page = pageScene(scene);
    for (const line of scene.relations.filter((each) => each.callout)) {
      expect(page.relations.find((each) => each.relation === line.relation)?.route).toEqual(
        line.route,
      );
    }
    const view = state.views.find((each) => each.id === VIEW);
    if (!view) throw new Error('No view.');
    const svg = svgOfScene(state, view, scene).text;
    expect(svg).not.toContain('>Torque<');
    expect(svg).not.toContain('>Angle<');
  });
});
