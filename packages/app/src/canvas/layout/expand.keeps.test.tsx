/**
 * Expanding gives a container's contents back their places (ADR 0080's clarification of 2026-11-02,
 * from the user's "se reorganiza solo como quiere"): each content with a stored position keeps it,
 * pinned or not, only those with none are laid out, the box grows from its corner to hold them, and
 * siblings move aside and come back as section 4 says.
 */
import {
  executeCommand,
  positionKey,
  type Command,
  type ProjectSnapshot,
} from '@visual-anything/core';
import type { Element, Id, Relation, ShapePosition } from '@visual-anything/schema';
import { renderHook, waitFor } from '@testing-library/react';
import ELK from 'elkjs/lib/elk.bundled.js';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';
import { VIEW, tablesProject } from '../../test/tables';
import type { Rect } from '../geometry';
import { buildSceneAfresh, type Scene } from '../scene';
import type { LayoutRunner } from './client';
import { layoutCommand } from './command';
import { layOut } from './engine';
import {
  ExpansionMemory,
  collapseCommand,
  expansionCommand,
  planExpansion,
  useExpandedInPlace,
} from './expand';
import { layoutInput } from './input';
import { measureScene } from './quality';
import { LayoutRunnerContext } from './useLayout';

const elk = new ELK();
const SEVEN = ['nombre', 'apellido', 'dni', 'nacimiento', 'sexo', 'obra-social', 'domicilio'];

function apply(project: ProjectSnapshot, command: Command): ProjectSnapshot {
  const done = executeCommand(project, command);
  if (!done.ok) throw new Error(done.problems.map((each) => each.message).join(' '));
  return done.state;
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

function positionsOf(project: ProjectSnapshot): Map<string, ShapePosition> {
  const view = project.views.find((each) => each.id === VIEW);
  return new Map((view?.positions ?? []).map((each) => [positionKey(each), each]));
}

/**
 * In World, `paciente` holds the seven shapes in `contents` (and `extra`, with no position, when
 * asked), and `next` stands to its right. Everything but `next` and `paciente` is placed by the
 * layout of `paciente`'s contents, as the person's Layout did.
 */
async function laidOutPatient(extra: readonly string[] = []): Promise<ProjectSnapshot> {
  const base = tablesProject({
    tables: [],
    elements: [box('paciente'), box('next'), ...SEVEN.map(box)],
    relations: SEVEN.map((id) => inside(id, 'paciente')),
    nesting: ['systems.is-part-of'],
    positions: [{ element: 'paciente', x: 0, y: 0 }],
  });
  const scope = { kind: 'contents', container: 'paciente' } as const;
  const scene = buildSceneAfresh(base, VIEW);
  const input = layoutInput(scene, base, scope);
  if (!input) throw new Error('Nothing to lay out.');
  const result = await layOut(input, elk);
  const action = layoutCommand(base, VIEW, scene, scope, result.shapes);
  if (!action) throw new Error('Layout placed nothing.');
  let project = apply(base, action.command);
  // A Layout of the whole view, with relations out of the container, left them in three columns,
  // which a layout of the contents alone would not give (the user's screenshots): still unpinned.
  const laid = buildSceneAfresh(project, VIEW);
  const size = rectOf(laid, SEVEN[0] as string);
  const first = positionsOf(project).get(
    positionKey({ element: SEVEN[0] as string, container: 'paciente' }),
  );
  const step = (n: number) => Math.ceil((n + 40) / 8) * 8;
  project = apply(project, {
    type: 'set-positions',
    view: VIEW,
    positions: SEVEN.map((element, at) => ({
      element,
      container: 'paciente',
      x: (first?.x ?? 24) + (at % 3) * step(size.width),
      y: (first?.y ?? 64) + Math.floor(at / 3) * step(size.height),
    })),
  });
  const open = rectOf(buildSceneAfresh(project, VIEW), 'paciente');
  project = apply(project, {
    type: 'set-positions',
    view: VIEW,
    positions: [{ element: 'next', x: open.x + open.width + 40, y: 0 }],
  });
  if (extra.length === 0) return project;
  return {
    ...project,
    model: {
      ...project.model,
      elements: [...project.model.elements, ...extra.map(box)],
      relations: [...project.model.relations, ...extra.map((id) => inside(id, 'paciente'))],
    },
  };
}

async function expandByHand(project: ProjectSnapshot, memory: ExpansionMemory) {
  const before = buildSceneAfresh(project, VIEW);
  const plan = planExpansion(project, VIEW, before, ['paciente']);
  if (!plan?.input) throw new Error('Nothing to expand.');
  const result = await layOut(plan.input, elk);
  const made = expansionCommand(VIEW, ['paciente'], plan, result.shapes, 'Expand "paciente"');
  memory.remember(VIEW, ['paciente'], made.moved);
  return { state: apply(project, made.command), moved: made.moved };
}

describe('expanding keeps its contents’ places', () => {
  it('a container of seven shapes laid out by layout, collapsed and expanded, keeps all seven and its size', async () => {
    const open = await laidOutPatient();
    const was = positionsOf(open);
    const openRect = rectOf(buildSceneAfresh(open, VIEW), 'paciente');
    const memory = new ExpansionMemory();
    const collapsed = apply(open, collapseCommand(open, VIEW, ['paciente'], 'Collapse', memory));
    const { state } = await expandByHand(collapsed, memory);
    const now = positionsOf(state);
    for (const id of SEVEN) {
      const key = positionKey({ element: id, container: 'paciente' });
      expect(now.get(key), id).toEqual(was.get(key));
    }
    const reopened = rectOf(buildSceneAfresh(state, VIEW), 'paciente');
    expect(reopened).toEqual(openRect);
    // And `next`, which collapsing closed in, stands clear of it again.
    const next = rectOf(buildSceneAfresh(state, VIEW), 'next');
    expect(next.x).toBeGreaterThanOrEqual(reopened.x + reopened.width + 40);
    expect(measureScene(buildSceneAfresh(state, VIEW)).overlappingSiblings).toBe(0);
  }, 30_000);

  it('keeps the stored contents and lays out only the new ones', async () => {
    const project = await laidOutPatient(['nuevo-1', 'nuevo-2']);
    const was = positionsOf(project);
    const collapsed = apply(project, {
      type: 'set-collapsed',
      view: VIEW,
      elements: ['paciente'],
      collapsed: true,
    });
    const { state } = await expandByHand(collapsed, new ExpansionMemory());
    const now = positionsOf(state);
    for (const id of SEVEN) {
      const key = positionKey({ element: id, container: 'paciente' });
      expect(now.get(key), id).toEqual(was.get(key));
    }
    for (const id of ['nuevo-1', 'nuevo-2']) {
      expect(now.has(positionKey({ element: id, container: 'paciente' })), id).toBe(true);
    }
    // The new ones were placed clear of what was kept, inside the grown box.
    const scene = buildSceneAfresh(state, VIEW);
    expect(measureScene(scene).overlappingSiblings).toBe(0);
    const holder = rectOf(scene, 'paciente');
    for (const id of ['nuevo-1', 'nuevo-2']) {
      const rect = rectOf(scene, id);
      expect(rect.x + rect.width).toBeLessThanOrEqual(holder.x + holder.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(holder.y + holder.height);
    }
  }, 30_000);

  it('moves siblings aside, and collapsing again gives them their places back', async () => {
    const open = await laidOutPatient();
    // Collapsed, with `next` closed in beside it, as after a reload.
    const collapsed = apply(open, collapseCommand(open, VIEW, ['paciente'], 'Collapse'));
    const closedIn = positionsOf(collapsed).get(positionKey({ element: 'next' }));
    const memory = new ExpansionMemory();
    const { state, moved } = await expandByHand(collapsed, memory);
    expect(moved.map((each) => each.element)).toEqual(['next']);
    expect(positionsOf(state).get(positionKey({ element: 'next' }))?.x).toBeGreaterThan(
      closedIn?.x ?? Infinity,
    );
    const back = apply(state, collapseCommand(state, VIEW, ['paciente'], 'Collapse', memory));
    expect(positionsOf(back).get(positionKey({ element: 'next' }))).toEqual(closedIn);
  }, 30_000);

  it('lays out a content whose stored place covers one kept before it, keeping the rest', async () => {
    const open = await laidOutPatient();
    const nombre = positionKey({ element: 'nombre', container: 'paciente' });
    const at = positionsOf(open).get(nombre) as ShapePosition;
    // `dni` was stored on top of `nombre`, as places stored while the contents were smaller are.
    const crowded = apply(open, {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'dni', container: 'paciente', x: at.x + 8, y: at.y + 8 }],
    });
    const was = positionsOf(crowded);
    const collapsed = apply(crowded, {
      type: 'set-collapsed',
      view: VIEW,
      elements: ['paciente'],
      collapsed: true,
    });
    const { state } = await expandByHand(collapsed, new ExpansionMemory());
    const now = positionsOf(state);
    for (const id of SEVEN.filter((each) => each !== 'dni')) {
      const key = positionKey({ element: id, container: 'paciente' });
      expect(now.get(key), id).toEqual(was.get(key));
    }
    const dni = positionKey({ element: 'dni', container: 'paciente' });
    expect(now.get(dni)).not.toEqual(was.get(dni));
    expect(measureScene(buildSceneAfresh(state, VIEW)).overlappingSiblings).toBe(0);
  }, 30_000);

  it('expanding by zoom draws the stored places', async () => {
    const open = await laidOutPatient();
    const was = positionsOf(open);
    const collapsed = apply(open, {
      type: 'set-collapsed',
      view: VIEW,
      elements: ['paciente'],
      collapsed: true,
    });
    const view = collapsed.views.find((each) => each.id === VIEW);
    const runner: LayoutRunner = { layOut: (input) => layOut(input, elk), dispose: () => {} };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <LayoutRunnerContext.Provider value={runner}>{children}</LayoutRunnerContext.Provider>
    );
    const zoomed: ReadonlySet<Id> = new Set(['paciente']);
    const { result } = renderHook(() => useExpandedInPlace(collapsed, view, zoomed), { wrapper });
    await waitFor(() => expect(result.current.expanded.has('paciente')).toBe(true), {
      timeout: 15_000,
    });
    const drawn = buildSceneAfresh(result.current.project, VIEW, result.current.expanded);
    const openScene = buildSceneAfresh(open, VIEW);
    for (const id of SEVEN) {
      expect(rectOf(drawn, id), id).toEqual(rectOf(openScene, id));
      const key = positionKey({ element: id, container: 'paciente' });
      const shown = result.current.project.views
        .find((each) => each.id === VIEW)
        ?.positions.find((each) => positionKey(each) === key);
      expect(shown, id).toEqual(was.get(key));
    }
  }, 30_000);
});
