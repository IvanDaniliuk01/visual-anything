import { SYSTEMS, executeCommand, type ProjectSnapshot } from '@visual-anything/core';
import type { ShapePosition } from '@visual-anything/schema';
import { act, renderHook } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { loadSample } from '../../test/sample';
import type { Point, Rect } from '../geometry';
import {
  buildScene,
  type ElementShape,
  type RelationLine,
  type Scene,
} from '../scene';
import { PLATE_HEIGHT, segmentCrosses } from './avoid';
import { avoidShapesOf, avoidedScene, routedLinesOf } from './avoided';
import { AvoidRunnerContext, inThreadAvoidRunner, type AvoidRunner } from './avoidRunner';
import { RoutesAround, shapeChanges, useAvoidedRoutes } from './useAvoidedRoutes';

const VIEW = 'v';

/** Services in a row, `a` to `b` across `m`, and `c` far below, positioned as given. */
function row(positions: Record<string, { x: number; y: number }> = {}): ProjectSnapshot {
  const at = (id: string, x: number, y: number): ShapePosition => ({
    element: id,
    ...(positions[id] ?? { x, y }),
  });
  return {
    project: { schemaVersion: 1, name: 'Row', packages: ['systems'] },
    model: {
      world: { id: 'world', component: 'essence', name: 'World' },
      elements: ['a', 'm', 'b', 'c'].map((id) => ({
        id,
        component: 'systems.service',
        name: id.toUpperCase(),
      })),
      relations: [
        { id: 'a-b', relationType: 'systems.communicates-with', from: 'a', to: 'b' },
        { id: 'a-c', relationType: 'systems.communicates-with', from: 'a', to: 'c' },
      ],
    },
    packages: [SYSTEMS],
    views: [
      {
        id: VIEW,
        name: 'Row',
        perspective: { name: 'Row' },
        nestingRelationTypes: ['systems.is-part-of'],
        positions: [at('a', 0, 0), at('m', 400, 0), at('b', 800, 0), at('c', 0, 2000)],
        freeShapes: [],
      },
    ],
    scenarios: [],
    tours: [],
    comments: [],
  };
}

const lineOf = (scene: Scene, id: string) =>
  scene.relations.find((line) => line.relation === id) as RelationLine;
const shapeOf = (scene: Scene, id: string) =>
  scene.shapes.find((shape) => shape.element === id) as ElementShape;

function crosses(route: Point[], rect: Rect): boolean {
  return route.some((point, at) => at > 0 && segmentCrosses(route[at - 1] as Point, point, rect));
}

/** A runner that counts what it is asked to route, and routes it a turn later. */
function counting(): AvoidRunner & { asked: number[] } {
  const inner = inThreadAvoidRunner();
  const asked: number[] = [];
  return {
    asked,
    route: (shapes, lines, center, onResults) => {
      asked.push(lines.length);
      return inner.route(shapes, lines, center, onResults);
    },
    dispose: () => inner.dispose(),
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('RoutesAround', () => {
  it('draws the stand-in route until the route around comes, then the route around', async () => {
    const changed = vi.fn();
    const routes = new RoutesAround(inThreadAvoidRunner(), changed, () => 0);
    const scene = buildScene(row(), VIEW);
    const first = routes.compose(VIEW, scene);
    expect(first).toBe(scene);
    expect(crosses(lineOf(first, 'a-b').route, shapeOf(scene, 'm').rect)).toBe(true);
    routes.request(VIEW, scene, undefined);
    await settle();
    expect(changed).toHaveBeenCalledOnce();
    const routed = routes.compose(VIEW, scene);
    const line = lineOf(routed, 'a-b');
    expect(crosses(line.route, shapeOf(scene, 'm').rect)).toBe(false);
    // What ends on a shape starts and ends where the line does, its arrowhead at its end.
    expect(line.from).toEqual(line.route[0]);
    expect(line.to).toEqual(line.route.at(-1));
    // The same scene and routes give the same scene, and the same lines.
    expect(routes.compose(VIEW, scene)).toBe(routed);
    expect(lineOf(routed, 'a-c')).toBe(lineOf(scene, 'a-c'));
  });

  it('asks again only for what a change touches', async () => {
    const runner = counting();
    const routes = new RoutesAround(
      runner,
      () => undefined,
      () => 0,
    );
    let project = row();
    const scene = buildScene(project, VIEW);
    routes.compose(VIEW, scene);
    routes.request(VIEW, scene, undefined);
    await settle();
    expect(runner.asked).toEqual([2]);
    // `c` moves far from both lines' regions but its own: only the line to it is routed again.
    const moved = executeCommand(project, {
      type: 'set-positions',
      view: VIEW,
      positions: [{ element: 'c', x: 40, y: 2400 }],
    });
    if (!moved.ok) throw new Error('The move was refused.');
    project = moved.state;
    const next = buildScene(project, VIEW);
    const kept = routes.compose(VIEW, next);
    // The line that did not move keeps its route around `m` meanwhile.
    expect(crosses(lineOf(kept, 'a-b').route, shapeOf(next, 'm').rect)).toBe(false);
    routes.request(VIEW, next, undefined);
    await settle();
    expect(runner.asked).toEqual([2, 1]);
  });

  it('routes again a line whose region a shape moves into, keeping its route meanwhile', async () => {
    const runner = counting();
    const routes = new RoutesAround(
      runner,
      () => undefined,
      () => 0,
    );
    const project = row();
    const scene = buildScene(project, VIEW);
    routes.compose(VIEW, scene);
    routes.request(VIEW, scene, undefined);
    await settle();
    const routed = lineOf(routes.compose(VIEW, scene), 'a-b');
    const before = routed.route;
    // `c` comes up into the way of the route around `m`, over the middle of its route.
    const c = shapeOf(scene, 'c');
    const moved = executeCommand(project, {
      type: 'set-positions',
      view: VIEW,
      positions: [
        {
          element: 'c',
          x: Math.round(routed.middle.x - c.rect.width / 2),
          y: Math.round(routed.middle.y - c.rect.height / 2),
        },
      ],
    });
    if (!moved.ok) throw new Error('The move was refused.');
    const next = buildScene(moved.state, VIEW);
    expect(lineOf(routes.compose(VIEW, next), 'a-b').route).toEqual(before);
    routes.request(VIEW, next, undefined);
    await settle();
    expect(runner.asked).toEqual([2, 2]);
    const after = lineOf(routes.compose(VIEW, next), 'a-b').route;
    expect(crosses(after, shapeOf(next, 'c').rect)).toBe(false);
    expect(crosses(after, shapeOf(next, 'm').rect)).toBe(false);
  });

  it('leaves a route set by hand as it is', async () => {
    const routed = executeCommand(row(), {
      type: 'set-route',
      view: VIEW,
      relation: 'a-b',
      style: 'straight',
    });
    if (!routed.ok) throw new Error('The route was refused.');
    const scene = buildScene(routed.state, VIEW);
    expect(routedLinesOf(scene).map((line) => line.relation)).toEqual(['a-c']);
    const routes = new RoutesAround(
      inThreadAvoidRunner(),
      () => undefined,
      () => 0,
    );
    routes.compose(VIEW, scene);
    routes.request(VIEW, scene, undefined);
    await settle();
    expect(lineOf(routes.compose(VIEW, scene), 'a-b')).toBe(lineOf(scene, 'a-b'));
  });

  it('lets what is being routed go on through a change that touches no route', async () => {
    const runner = counting();
    const routes = new RoutesAround(
      runner,
      () => undefined,
      () => 0,
    );
    const scene = buildScene(row(), VIEW);
    routes.compose(VIEW, scene);
    expect(routes.request(VIEW, scene, undefined)).toBe(true);
    // A live value changes a detail, before the routes come: nothing to ask again.
    const live: Scene = {
      ...scene,
      shapes: scene.shapes.map((shape) => ({ ...shape, detail: 'Service · 12 ms' })),
    };
    routes.compose(VIEW, live);
    expect(routes.request(VIEW, live, undefined)).toBe(false);
    await settle();
    expect(runner.asked).toEqual([2]);
    expect(crosses(lineOf(routes.compose(VIEW, live), 'a-b').route, shapeOf(scene, 'm').rect)).toBe(
      false,
    );
  });

  it('routes what a view still lacked when it is shown again', async () => {
    const runner = counting();
    const routes = new RoutesAround(
      runner,
      () => undefined,
      () => 0,
    );
    const first = buildScene(row(), VIEW);
    routes.compose(VIEW, first);
    expect(routes.request(VIEW, first, undefined)).toBe(true);
    // Another view is shown before the first's routes come, which stops them.
    const other = buildScene(row({ c: { x: 0, y: 3000 } }), VIEW);
    routes.compose('w', other);
    expect(routes.request('w', other, undefined)).toBe(true);
    await settle();
    const shown = routes.compose(VIEW, first);
    expect(crosses(lineOf(shown, 'a-b').route, shapeOf(first, 'm').rect)).toBe(true);
    // Shown again, as it was: what it still lacked is asked for again, and comes.
    expect(routes.request(VIEW, first, undefined)).toBe(true);
    await settle();
    expect(runner.asked).toEqual([2, 2, 2]);
    const again = routes.compose(VIEW, first);
    expect(crosses(lineOf(again, 'a-b').route, shapeOf(first, 'm').rect)).toBe(false);
    expect(routes.request(VIEW, first, undefined)).toBe(false);
  });

  it('draws the scene as built without a runner', () => {
    const scene = buildScene(row(), VIEW);
    const routes = new RoutesAround(undefined, () => undefined);
    expect(routes.compose(VIEW, scene)).toBe(scene);
  });
});

describe('useAvoidedRoutes', () => {
  const wrapper =
    (runner: AvoidRunner | undefined) =>
    ({ children }: { children: ReactNode }) =>
      createElement(AvoidRunnerContext.Provider, { value: runner }, children);

  it('gives the scene with the routes the runner gives, once they come', async () => {
    const scene = buildScene(row(), VIEW);
    const hook = renderHook(() => useAvoidedRoutes(scene, VIEW, () => undefined), {
      wrapper: wrapper(inThreadAvoidRunner()),
    });
    expect(hook.result.current).toBe(scene);
    await act(settle);
    const line = lineOf(hook.result.current as Scene, 'a-b');
    expect(crosses(line.route, shapeOf(scene, 'm').rect)).toBe(false);
  });

  it('gives nothing for no scene, and the scene as built without a runner', () => {
    const scene = buildScene(row(), VIEW);
    expect(
      renderHook(() => useAvoidedRoutes(undefined, VIEW, () => undefined), {
        wrapper: wrapper(inThreadAvoidRunner()),
      }).result.current,
    ).toBeUndefined();
    expect(
      renderHook(() => useAvoidedRoutes(scene, VIEW, () => undefined), {
        wrapper: wrapper(undefined),
      }).result.current,
    ).toBe(scene);
  });
});

describe('shapeChanges', () => {
  it('counts no shape that changed only what routes do not go around', () => {
    const scene = buildScene(row(), VIEW);
    const recolored = scene.shapes.map((shape) => ({ ...shape, fill: '#123456', detail: 'x' }));
    expect(shapeChanges(scene.shapes, recolored)).toEqual([]);
  });

  it('is nothing for the same shapes, and where each changed shape was and is', () => {
    const scene = buildScene(row(), VIEW);
    expect(shapeChanges(scene.shapes, scene.shapes)).toEqual([]);
    const moved = buildScene(row({ c: { x: 40, y: 2400 } }), VIEW);
    const was = shapeOf(scene, 'c').rect;
    const now = shapeOf(moved, 'c').rect;
    const box = {
      x: Math.min(was.x, now.x),
      y: Math.min(was.y, now.y),
      width: Math.max(was.x + was.width, now.x + now.width) - Math.min(was.x, now.x),
      height: Math.max(was.y + was.height, now.y + now.height) - Math.min(was.y, now.y),
    };
    expect(shapeChanges(scene.shapes, moved.shapes)).toEqual([
      { key: 'c', rects: [was, now], plates: [], box },
    ]);
    // A shape taken away counts where it was.
    const fewer = { ...scene, shapes: scene.shapes.filter((shape) => shape.element !== 'm') };
    expect(shapeChanges(scene.shapes, fewer.shapes)).toEqual([
      { key: 'm', rects: [shapeOf(scene, 'm').rect], plates: [], box: shapeOf(scene, 'm').rect },
    ]);
  });
});

describe('the Structure view of Visual Anything modeled with itself', () => {
  const project = loadSample('visual-anything');

  it('routes its lines around every shape and name plate in their way', () => {
    for (const view of project.views) {
      const scene = buildScene(project, view.id);
      const routed = avoidedScene(scene);
      const { shapes, indexes } = avoidShapesOf(scene.shapes);
      const crossings = (drawn: Scene) =>
        routedLinesOf(scene).filter((original) => {
          const line = drawn.relations.find((each) => each.relation === original.relation);
          if (
            !line ||
            !line.ends ||
            line.ends.from.kind !== 'shape' ||
            line.ends.to.kind !== 'shape'
          ) {
            return false;
          }
          const from = indexes.get(line.ends.from.key) as number;
          const to = indexes.get(line.ends.to.key) as number;
          const above = (at: number) => {
            const all = new Set<number>();
            for (
              let up = shapes.parents[at] as number;
              up !== -1;
              up = shapes.parents[up] as number
            ) {
              all.add(up);
            }
            return all;
          };
          const ends = new Set([from, to, ...above(from), ...above(to)]);
          return scene.shapes.some((shape, at) => {
            if (ends.has(at)) return false;
            // What a line's end holds is inside the end.
            for (
              let up = shapes.parents[at] as number;
              up !== -1;
              up = shapes.parents[up] as number
            ) {
              if (up === from || up === to) return false;
            }
            const plate = shape.holdsContents
              ? { ...shape.rect, height: Math.min(PLATE_HEIGHT, shape.rect.height) }
              : shape.rect;
            return (
              crosses(line.route, shape.plate ?? shape.rect) ||
              (ends.has(at) && crosses(line.route, plate))
            );
          });
        });
      const before = crossings(scene).length;
      const after = crossings(routed).length;
      expect(after).toBeLessThan(Math.max(1, before));
      // A few lines among many shapes may keep their stand-in routes; most go around.
      expect(after).toBeLessThanOrEqual(Math.ceil(before / 4));
    }
  });
});
