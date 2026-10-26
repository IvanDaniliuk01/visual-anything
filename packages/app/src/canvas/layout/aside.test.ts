/**
 * Placing new shapes never covers the shapes beside them (M6's dogfooding): when a container grows
 * with the new shapes layout places in it, the unpinned shapes beside it that the view stores move
 * aside, right or down, keeping the room they had, and so do those they would then cover; pinned
 * shapes never move, and a shape moved aside goes past them. Through the canvas, the placement stores
 * those moves with the new shapes' positions, under the new shapes' label.
 */
import { executeCommand, type Command, type ProjectSnapshot } from '@visual-anything/core';
import ELK from 'elkjs/lib/elk.bundled.js';
import { describe, expect, it } from 'vitest';
import { loadSample } from '../../test/sample';
import type { Rect } from '../geometry';
import { buildScene } from '../scene';
import { layoutCommand } from './command';
import { layOut, movedAside, type ElkEngine } from './engine';
import { layoutInput } from './input';
import { NODE_GAP, type LaidOutShape, type LayoutInput, type LayoutShape } from './types';

const elk: ElkEngine = new ELK();

/** A shape kept where the view stores it, unpinned, 160 by 72 unless told otherwise. */
function kept(
  key: string,
  parent: number,
  options: Partial<Omit<LayoutShape, 'key' | 'parent'>> = {},
): LayoutShape {
  const element = key.split('/').at(-1) as string;
  return {
    key,
    element,
    parent,
    free: false,
    aside: true,
    x: 0,
    y: 0,
    width: 160,
    height: 72,
    ...options,
  };
}

const input = (shapes: LayoutShape[]): LayoutInput => ({ shapes, relations: [], obstacles: [] });

function at(placed: readonly LaidOutShape[], element: string): LaidOutShape | undefined {
  return placed.find((each) => each.element === element);
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

/** A container 200 wide holding one kept shape, with room below it for nothing more. */
const box = (x: number, y: number) =>
  kept('box', -1, { x, y, width: 208, height: 152, baseWidth: 160, baseHeight: 72 });

describe('moving aside what a growing container would cover', () => {
  it('moves the shape below it down, keeping its room, and leaves the shape beside it', async () => {
    const shapes = [
      box(0, 0),
      kept('box/old', 0, { x: 24, y: 48 }),
      { ...kept('box/new', 0), free: true, aside: undefined },
      kept('below', -1, { x: 0, y: 192 }),
      kept('beside', -1, { x: 600, y: 0 }),
      kept('above', -1, { x: 0, y: -200 }),
    ] as LayoutShape[];
    const { shapes: placed } = await layOut(input(shapes), elk);
    const below = at(placed, 'below');
    expect(below).toMatchObject({ aside: true, x: 0 });
    // It kept the 40 it had below the box, under the box as it grew.
    expect(below?.y).toBeGreaterThan(192);
    expect(at(placed, 'beside')).toBeUndefined();
    expect(at(placed, 'above')).toBeUndefined();
    expect(at(placed, 'new')).toBeDefined();
  });

  it('moves on what the moved shape would cover in turn, and never a pinned shape', async () => {
    const shapes = [
      box(0, 0),
      kept('box/old', 0, { x: 24, y: 48 }),
      { ...kept('box/new', 0), free: true, aside: undefined },
      kept('below', -1, { x: 0, y: 192 }),
      kept('further', -1, { x: 0, y: 304 }),
      { ...kept('pinned', -1, { x: 200, y: 192 }), aside: undefined },
    ] as LayoutShape[];
    const { shapes: placed } = await layOut(input(shapes), elk);
    const below = at(placed, 'below') as LaidOutShape;
    const further = at(placed, 'further') as LaidOutShape;
    expect(further.y).toBeGreaterThanOrEqual(below.y + 72 + NODE_GAP);
    expect(at(placed, 'pinned')).toBeUndefined();
  });

  it('grows the container around it, and moves aside what that container then covers', async () => {
    const shapes = [
      kept('outer', -1, { width: 304, height: 272, baseWidth: 160, baseHeight: 72 }),
      kept('outer/box', 0, {
        x: 24,
        y: 48,
        width: 208,
        height: 152,
        baseWidth: 160,
        baseHeight: 72,
      }),
      kept('outer/box/old', 1, { x: 24, y: 48 }),
      { ...kept('outer/box/new', 1), free: true, aside: undefined },
      kept('next', -1, { x: 0, y: 312 }),
    ] as LayoutShape[];
    const { shapes: placed } = await layOut(input(shapes), elk);
    expect(at(placed, 'next')?.y).toBeGreaterThan(312);
  });
});

describe('where a shape moves aside', () => {
  const before = { x: 0, y: 0, width: 200, height: 150 };

  it('goes right or down, whichever moves it less, and only when the growth comes near', () => {
    expect(
      movedAside(before, { ...before, height: 300 }, { x: 0, y: 190, width: 100, height: 60 }, []),
    ).toEqual({ x: 0, y: 344 });
    expect(
      movedAside(before, { ...before, width: 400 }, { x: 240, y: 0, width: 100, height: 60 }, []),
    ).toEqual({ x: 440, y: 0 });
    // Far enough below, it stays.
    expect(
      movedAside(before, { ...before, height: 200 }, { x: 0, y: 400, width: 100, height: 60 }, []),
    ).toBeUndefined();
    // Above or overlapping already, it stays.
    expect(
      movedAside(before, { ...before, height: 300 }, { x: 0, y: -100, width: 100, height: 60 }, []),
    ).toBeUndefined();
  });

  it('goes past what stays where it would land', () => {
    const stays = [{ x: 0, y: 320, width: 100, height: 60 }];
    const place = movedAside(
      before,
      { ...before, height: 300 },
      { x: 0, y: 190, width: 100, height: 60 },
      stays,
    );
    expect(place).toEqual({ x: 0, y: 424 });
    expect(
      overlaps({ ...(place as { x: number; y: number }), width: 100, height: 60 }, stays[0]!),
    ).toBe(false);
  });
});

describe('placing what Claude adds inside a container, on the canvas', () => {
  const VIEW = 'system-overview';

  /** Runs a command as the local program would, or fails. */
  function run(project: ProjectSnapshot, command: Command): ProjectSnapshot {
    const outcome = executeCommand(project, command);
    if (!outcome.ok) throw new Error(outcome.problems.map((each) => each.message).join(' '));
    return outcome.state;
  }

  it('stores the moves aside with the new shape, under the new shape’s label, and nothing overlaps', async () => {
    // The patient, unpinned, stored 16 below the Clinic booking system (240, 40, 984 by 480), where
    // the sample's note was.
    const beside = run(loadSample(), {
      type: 'batch',
      label: 'Make room',
      commands: [
        { type: 'delete-free-shapes', view: VIEW, ids: ['calendar-note'] },
        { type: 'set-positions', view: VIEW, positions: [{ element: 'patient', x: 240, y: 536 }] },
      ],
    });
    const project = run(beside, {
      type: 'create-element',
      element: { id: 'billing', component: 'systems.service', name: 'Billing' },
      containers: [{ container: 'clinic-booking', relationType: 'systems.is-part-of' }],
    });
    const scene = buildScene(project, VIEW);
    const keys = new Set(
      scene.shapes.filter((shape) => shape.element === 'billing').map((shape) => shape.key),
    );
    const laid = layoutInput(scene, project, { kind: 'new', keys });
    if (!laid) throw new Error('Nothing to lay out.');
    const { shapes } = await layOut(laid, elk);
    const action = layoutCommand(project, VIEW, scene, { kind: 'new', keys }, shapes);
    if (!action) throw new Error('Nothing laid out.');
    expect(action.command).toMatchObject({ label: 'Lay out "Billing" in "System overview"' });
    const placed = run(project, action.command);
    const drawn = buildScene(placed, VIEW);
    const rect = (element: string) => {
      const found = drawn.shapes.find((shape) => shape.element === element);
      if (!found) throw new Error(`No shape of ${element}.`);
      return found.rect;
    };
    expect(rect('clinic-booking').height).toBeGreaterThan(480);
    expect(overlaps(rect('clinic-booking'), rect('patient'))).toBe(false);
    // It moved down only, and kept its room under the system.
    const patient = placed.views[0]?.positions.find((each) => each.element === 'patient');
    expect(patient?.x).toBe(240);
    expect(patient?.pinned).toBeUndefined();
    expect(rect('patient').y - (rect('clinic-booking').y + rect('clinic-booking').height)).toBe(16);
  });

  it('never moves a pinned shape, even when the container comes to cover it', async () => {
    const project = run(loadSample(), {
      type: 'create-element',
      element: { id: 'billing', component: 'systems.service', name: 'Billing' },
      containers: [{ container: 'clinic-booking', relationType: 'systems.is-part-of' }],
    });
    const scene = buildScene(project, VIEW);
    const keys = new Set(
      scene.shapes.filter((shape) => shape.element === 'billing').map((shape) => shape.key),
    );
    const laid = layoutInput(scene, project, { kind: 'new', keys });
    if (!laid) throw new Error('Nothing to lay out.');
    const { shapes } = await layOut(laid, elk);
    expect(shapes.some((each) => each.element === 'patient')).toBe(false);
  });
});
