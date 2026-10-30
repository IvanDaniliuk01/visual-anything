/**
 * Collapsing closes the room it leaves (ADR 0080's clarification of 2026-10-29, M3c Stage 1): a
 * container collapsed with no places to give back moves the shapes it freed back left or up, by the
 * least that keeps 40 units apart, in their order, level by level up to World, pinned ones never, in
 * the same undoable action as the collapse.
 */
import {
  applyOperations,
  executeCommand,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Relation, ShapePosition } from '@visual-anything/schema';
import { describe, expect, it } from 'vitest';
import { VIEW, tablesProject } from '../../test/tables';
import type { Rect } from '../geometry';
import { buildSceneAfresh, type Scene } from '../scene';
import ELK from 'elkjs/lib/elk.bundled.js';
import { loadDataModel } from '../../test/dataModel';
import { layOut } from './engine';
import { ExpansionMemory, collapseCommand, expansionCommand, planExpansion } from './expand';
import { measureScene } from './quality';

const GAP = 40;

function apply(project: ProjectSnapshot, command: Command) {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done;
}

const box = (id: string): Element => ({ id, component: 'systems.box', name: id });
const inside = (id: string, container: string): Relation => ({
  id: `${id}-in-${container}`,
  relationType: 'systems.is-part-of',
  from: id,
  to: container,
});

function rectOf(scene: Scene, element: string): Rect {
  const shape = scene.shapes.find((each) => each.element === element);
  if (!shape) throw new Error(`No shape for ${element}`);
  return shape.rect;
}

/**
 * In World, `outer` holds `config`, open with two shapes inside, and beside it `right`, then
 * `farther`; `under` below `config`, and below it `pinned`, pinned; `aside` far below everything.
 * Beside `outer`, in World, `next`.
 */
function opened(): ProjectSnapshot {
  const elements = ['outer', 'config', 'a', 'b', 'right', 'farther', 'under', 'pinned', 'next'].map(
    box,
  );
  const relations = [
    inside('config', 'outer'),
    inside('a', 'config'),
    inside('b', 'config'),
    inside('right', 'outer'),
    inside('farther', 'outer'),
    inside('under', 'outer'),
    inside('pinned', 'outer'),
  ];
  const base = tablesProject({
    tables: [],
    elements: [...elements, box('aside')],
    relations,
    nesting: ['systems.is-part-of'],
    positions: [
      { element: 'outer', x: 0, y: 0 },
      { element: 'config', container: 'outer', x: 24, y: 64 },
      { element: 'a', container: 'config', x: 24, y: 64 },
      { element: 'b', container: 'config', x: 424, y: 264 },
    ],
  });
  // The neighbours stand 40 from where the open container ends, as expanding it left them.
  const scene = buildSceneAfresh(base, VIEW);
  const config = rectOf(scene, 'config');
  const outer = rectOf(scene, 'outer');
  const relative = { x: config.x - outer.x, y: config.y - outer.y };
  const right = relative.x + config.width + GAP;
  const positions: ShapePosition[] = [
    { element: 'right', container: 'outer', x: right, y: relative.y },
    { element: 'farther', container: 'outer', x: right + 160 + GAP, y: relative.y },
    {
      element: 'pinned',
      container: 'outer',
      x: relative.x,
      y: relative.y + config.height + GAP + 200,
      pinned: true,
    },
    { element: 'under', container: 'outer', x: relative.x, y: relative.y + config.height + GAP },
  ];
  const grown = apply(base, { type: 'set-positions', view: VIEW, positions }).state;
  const whole = rectOf(buildSceneAfresh(grown, VIEW), 'outer');
  return apply(grown, {
    type: 'set-positions',
    view: VIEW,
    positions: [
      { element: 'next', x: whole.x + whole.width + GAP, y: 0 },
      { element: 'aside', x: 0, y: whole.y + whole.height + 4000 },
    ],
  }).state;
}

describe('collapsing a container with no places to give back', () => {
  it('moves what it freed back left or up, keeping 40 apart, level by level, in one action', () => {
    const project = opened();
    const before = buildSceneAfresh(project, VIEW);
    const command = collapseCommand(
      project,
      VIEW,
      ['config'],
      'Collapse "config"',
      new ExpansionMemory(),
    );
    expect(command.type).toBe('batch');
    if (command.type !== 'batch') return;
    expect(command.label).toBe('Collapse "config"');
    expect(command.commands.map((each) => each.type)).toEqual(['set-collapsed', 'set-positions']);

    const done = apply(project, command);
    const after = buildSceneAfresh(done.state, VIEW);
    const config = rectOf(after, 'config');
    const right = rectOf(after, 'right');
    const farther = rectOf(after, 'farther');
    const under = rectOf(after, 'under');
    // Each moved back to 40 from what is before it, within one step of the grid.
    const gap = (from: number, to: number) => to - from;
    expect(gap(config.x + config.width, right.x)).toBeGreaterThanOrEqual(GAP);
    expect(gap(config.x + config.width, right.x)).toBeLessThan(GAP + 8);
    expect(gap(right.x + right.width, farther.x)).toBeGreaterThanOrEqual(GAP);
    expect(gap(right.x + right.width, farther.x)).toBeLessThan(GAP + 8);
    expect(gap(config.y + config.height, under.y)).toBeGreaterThanOrEqual(GAP);
    expect(gap(config.y + config.height, under.y)).toBeLessThan(GAP + 8);
    // In their order, and up or left only.
    expect(right.x).toBeLessThan(rectOf(before, 'right').x);
    expect(right.y).toBe(rectOf(before, 'right').y);
    expect(under.x).toBe(rectOf(before, 'under').x);
    // The pinned one stays.
    expect(rectOf(after, 'pinned')).toEqual(rectOf(before, 'pinned'));
    // Up to World: the outer container shrank, and what stood beside it closed up.
    const outer = rectOf(after, 'outer');
    expect(outer.width).toBeLessThan(rectOf(before, 'outer').width);
    const next = rectOf(after, 'next');
    expect(gap(outer.x + outer.width, next.x)).toBeGreaterThanOrEqual(GAP);
    expect(gap(outer.x + outer.width, next.x)).toBeLessThan(GAP + 8);
    // What stood nowhere near stays, and nothing overlaps.
    expect(rectOf(after, 'aside')).toEqual(rectOf(before, 'aside'));
    expect(measureScene(after).overlappingSiblings).toBe(0);
    // Undo puts everything back.
    expect(applyOperations(done.state, done.inverse).state).toEqual(project);
  });

  it('gives the places back instead, when expanding moved them in this tab', () => {
    const project = opened();
    const view = project.views[0];
    const right = view?.positions.find((each) => each.element === 'right') as ShapePosition;
    const memory = new ExpansionMemory();
    const from = { x: right.x - 200, y: right.y };
    memory.remember(
      VIEW,
      ['config'],
      [{ element: 'right', container: 'outer', from, to: { x: right.x, y: right.y } }],
    );
    const command = collapseCommand(project, VIEW, ['config'], 'Collapse "config"', memory);
    expect(command).toEqual({
      type: 'batch',
      label: 'Collapse "config"',
      commands: [
        { type: 'set-collapsed', view: VIEW, elements: ['config'], collapsed: true },
        { type: 'set-positions', view: VIEW, positions: [{ ...right, ...from }] },
      ],
    });
  });

  it('on the fixture, after a reload, closes up what expanding a schema moved aside, overlapping nothing', async () => {
    const base = loadDataModel();
    const overview = base.views.find((view) => view.id === 'overview');
    const before = buildSceneAfresh(base, 'overview');
    // The first schema whose expansion moves something aside.
    let found: { schema: string; expanded: ProjectSnapshot } | undefined;
    for (const schema of (overview?.collapsed ?? []).filter((id) => id.startsWith('schema-'))) {
      const plan = planExpansion(base, 'overview', before, [schema]);
      if (!plan?.input) continue;
      const result = await layOut(plan.input, new ELK());
      const made = expansionCommand('overview', [schema], plan, result.shapes, 'Expand');
      if (made.moved.length === 0) continue;
      found = { schema, expanded: apply(base, made.command).state };
      break;
    }
    if (!found) throw new Error('No expansion moves anything aside.');
    const { schema, expanded } = found;
    // A reload forgets what expanding moved: collapsing closes the room instead.
    const command = collapseCommand(
      expanded,
      'overview',
      [schema],
      'Collapse',
      new ExpansionMemory(),
    );
    expect(command.type).toBe('batch');
    const closed = buildSceneAfresh(apply(expanded, command).state, 'overview');
    expect(measureScene(closed).overlappingSiblings).toBe(0);
    // What expanding moved aside comes back toward where it was, never past it.
    const was = new Map(before.shapes.map((shape) => [shape.key, shape.rect]));
    const open = new Map(buildSceneAfresh(expanded, 'overview').shapes.map((s) => [s.key, s.rect]));
    let back = 0;
    for (const shape of closed.shapes) {
      const first = was.get(shape.key);
      const wide = open.get(shape.key);
      if (!first || !wide || shape.positioned === 'pinned') continue;
      if (shape.rect.x < wide.x || shape.rect.y < wide.y) back += 1;
      expect(shape.rect.x).toBeLessThanOrEqual(wide.x);
      expect(shape.rect.y).toBeLessThanOrEqual(wide.y);
    }
    expect(back).toBeGreaterThan(0);
  }, 60_000);
});
